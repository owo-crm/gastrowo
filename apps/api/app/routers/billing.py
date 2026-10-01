from __future__ import annotations

from datetime import UTC, datetime
import json
from importlib import import_module
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.services import referrals as referrals_service
from app.core.envelope import ok
from app.core.permissions import can_manage_business_settings
from app.db import get_db
from app.models import Organization, OrganizationSubscription, RoleEnum, SubscriptionPlanEnum, SubscriptionStatusEnum
from app.schemas import BillingCheckoutSessionOut, BillingCheckoutSessionRequest, BillingPortalSessionOut
from app.services.billing import (
    checkout_currency_for,
    STARTER_LOCATION_LIMIT,
    count_locations,
    extra_location_price_table,
    extra_locations_for,
    plan_price_table,
    sync_stripe_locations,
)

router = APIRouter(prefix="/billing", tags=["billing"])


def _require_billing_access(context: OrgContext, organization: Organization) -> None:
    if context.membership.role == RoleEnum.ADMIN or can_manage_business_settings(context.membership, organization):
        return
    raise HTTPException(status_code=403, detail="Billing access is disabled for this role")


def _get_subscription(db: Session, organization_id: UUID) -> OrganizationSubscription:
    subscription = db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization_id))
    if subscription is None:
        subscription = OrganizationSubscription(
            organization_id=organization_id,
            plan=SubscriptionPlanEnum.FREE,
            status=SubscriptionStatusEnum.ACTIVE,
            billing_cycle="monthly",
        )
        db.add(subscription)
        db.flush()
    return subscription


def _get_stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    try:
        stripe = import_module("stripe")
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Stripe SDK is not installed") from exc
    stripe.api_key = settings.stripe_secret_key
    return stripe


def _price_id_for(plan: SubscriptionPlanEnum, billing_cycle: str, currency: str) -> str:
    price_id = plan_price_table().get((plan, billing_cycle, currency), "")
    if not price_id:
        raise HTTPException(status_code=503, detail=f"Stripe price is not configured for {plan.value}/{billing_cycle}/{currency}")
    return price_id


def _datetime_from_unix(value: Any) -> datetime | None:
    if value in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except Exception:
        return None


def _status_from_stripe(raw_status: str | None) -> SubscriptionStatusEnum:
    if raw_status == "trialing":
        return SubscriptionStatusEnum.TRIALING
    # past_due: Stripe is still retrying the card, the plan stays on meanwhile.
    if raw_status == "past_due":
        return SubscriptionStatusEnum.PAST_DUE
    # unpaid: retries ran out; incomplete: the first payment never went through. Neither keeps the plan.
    if raw_status in {"unpaid", "incomplete"}:
        return SubscriptionStatusEnum.EXPIRED
    if raw_status in {"canceled", "cancelled"}:
        return SubscriptionStatusEnum.CANCELED
    if raw_status == "incomplete_expired":
        return SubscriptionStatusEnum.EXPIRED
    return SubscriptionStatusEnum.ACTIVE


def _plan_from_price_id(price_id: str | None) -> tuple[SubscriptionPlanEnum, str] | None:
    reverse_mapping = {
        # Older per-person prices stay readable for subscriptions created before per-location billing.
        settings.stripe_price_standard_monthly: (SubscriptionPlanEnum.STANDARD, "monthly"),
        settings.stripe_price_standard_annual: (SubscriptionPlanEnum.STANDARD, "annual"),
        settings.stripe_price_pro_monthly: (SubscriptionPlanEnum.PRO, "monthly"),
        settings.stripe_price_pro_annual: (SubscriptionPlanEnum.PRO, "annual"),
        settings.stripe_price_business_monthly: (SubscriptionPlanEnum.BUSINESS, "monthly"),
        settings.stripe_price_business_annual: (SubscriptionPlanEnum.BUSINESS, "annual"),
        **{price: (plan, cycle) for (plan, cycle, _currency), price in plan_price_table().items()},
    }
    reverse_mapping.pop("", None)
    if not price_id:
        return None
    return reverse_mapping.get(price_id)


def _subscription_period_end(payload: dict) -> datetime | None:
    """Newer Stripe API versions keep the billing period on each item, older ones on the subscription."""
    ends = [item.get("current_period_end") for item in (payload.get("items") or {}).get("data") or [] if item.get("current_period_end")]
    return _datetime_from_unix(payload.get("current_period_end") or (max(ends) if ends else None))


def _upsert_subscription_from_stripe(db: Session, payload: dict) -> OrganizationSubscription | None:
    """`payload` is the subscription as plain JSON from the webhook body (not an SDK object)."""
    metadata = payload.get("metadata") or {}
    org_id_raw = metadata.get("organization_id")
    stripe_subscription_id = payload.get("id")
    stripe_customer_id = payload.get("customer")

    subscription = None
    if org_id_raw:
        try:
            org_id = UUID(org_id_raw)
        except ValueError:
            org_id = None
        if org_id is not None:
            subscription = db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == org_id))
    if subscription is None and stripe_subscription_id:
        subscription = db.scalar(
            select(OrganizationSubscription).where(OrganizationSubscription.stripe_subscription_id == stripe_subscription_id)
        )
    if subscription is None and stripe_customer_id:
        subscription = db.scalar(
            select(OrganizationSubscription).where(OrganizationSubscription.stripe_customer_id == stripe_customer_id)
        )
    if subscription is None:
        return None

    items = (payload.get("items") or {}).get("data") or []
    # The Pro add-on item carries no plan; take the first item whose price names one.
    resolved_plan = None
    for item in items:
        resolved_plan = _plan_from_price_id((item.get("price") or {}).get("id"))
        if resolved_plan is not None:
            break
    if resolved_plan is not None:
        subscription.plan = resolved_plan[0]
        subscription.billing_cycle = resolved_plan[1]

    subscription.status = _status_from_stripe(payload.get("status"))
    subscription.stripe_customer_id = stripe_customer_id or subscription.stripe_customer_id
    subscription.stripe_subscription_id = stripe_subscription_id or subscription.stripe_subscription_id
    subscription.trial_ends_at = _datetime_from_unix(payload.get("trial_end"))
    subscription.current_period_ends_at = _subscription_period_end(payload)
    db.add(subscription)
    return subscription


@router.post("/checkout-session")
def create_checkout_session(
    payload: BillingCheckoutSessionRequest,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    _require_billing_access(context, organization)
    stripe = _get_stripe()
    subscription = _get_subscription(db, context.membership.organization_id)
    if payload.plan not in (SubscriptionPlanEnum.STANDARD, SubscriptionPlanEnum.PRO):
        raise HTTPException(status_code=422, detail="Only the Starter and Pro plans can be purchased")
    if subscription.stripe_subscription_id:
        raise HTTPException(status_code=409, detail="This workspace already has a subscription; manage it in the billing portal")
    # Buying during the free Pro trial changed nothing visible and cut the trial short: plans open when it ends.
    trial_end = subscription.trial_ends_at.replace(tzinfo=UTC) if subscription.trial_ends_at and subscription.trial_ends_at.tzinfo is None else subscription.trial_ends_at
    if subscription.status == SubscriptionStatusEnum.TRIALING and trial_end is not None and trial_end > datetime.now(UTC):
        raise HTTPException(status_code=409, detail=f"Your free Pro trial runs until {trial_end:%B %-d}. You can choose a plan when it ends.")
    currency = checkout_currency_for(organization.country)
    price_id = _price_id_for(payload.plan, payload.billing_cycle, currency)
    locations = count_locations(db, context.membership.organization_id)
    if payload.plan == SubscriptionPlanEnum.STANDARD and locations > STARTER_LOCATION_LIMIT:
        raise HTTPException(status_code=409, detail="Starter covers one location. Choose Pro or remove the other locations first.")
    referral_credit = (organization.referral_free_months or 0) > 0 and not subscription.stripe_coupon_id
    # Flat plan price; Pro adds one add-on unit per location beyond the included three (kept in step by sync_stripe_locations).
    line_items = [{"price": price_id, "quantity": 1}]
    extra = extra_locations_for(payload.plan, locations)
    if extra:
        extra_price = extra_location_price_table().get((payload.billing_cycle, currency), "")
        if not extra_price:
            raise HTTPException(status_code=503, detail=f"Stripe extra-location price is not configured for {payload.billing_cycle}/{currency}")
        line_items.append({"price": extra_price, "quantity": extra})

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=line_items,
        success_url=settings.billing_success_url,
        cancel_url=settings.billing_cancel_url,
        # A discount set in the platform admin panel rides along; then a free month earned by referrals;
        # otherwise customers may enter promo codes.
        **(
            {"discounts": [{"coupon": subscription.stripe_coupon_id}]}
            if subscription.stripe_coupon_id
            else {"discounts": [{"coupon": referrals_service.free_month_coupon(stripe)}]}
            if referral_credit
            else {"allow_promotion_codes": True}
        ),
        client_reference_id=str(context.membership.organization_id),
        customer=subscription.stripe_customer_id or None,
        customer_email=None if subscription.stripe_customer_id else context.user.email,
        metadata={
            "organization_id": str(context.membership.organization_id),
            "plan": payload.plan.value,
            "billing_cycle": payload.billing_cycle,
        },
        subscription_data={
            "metadata": {
                "organization_id": str(context.membership.organization_id),
                "plan": payload.plan.value,
                "billing_cycle": payload.billing_cycle,
                # Tells the webhook to use up one referral free month once the subscription exists.
                **({"referral_credit": "1"} if referral_credit else {}),
            }
        },
    )
    return ok(BillingCheckoutSessionOut(id=session.id, url=session.url).model_dump(mode="json"))


@router.post("/portal-session")
def create_billing_portal_session(
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    _require_billing_access(context, organization)
    stripe = _get_stripe()
    subscription = _get_subscription(db, context.membership.organization_id)
    if not subscription.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer is linked to this workspace yet")

    session = stripe.billing_portal.Session.create(
        customer=subscription.stripe_customer_id,
        return_url=settings.billing_portal_return_url,
    )
    return ok(BillingPortalSessionOut(url=session.url).model_dump(mode="json"))


@router.post("/webhooks/stripe")
async def handle_stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    stripe = _get_stripe()
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhook secret is not configured")

    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    try:
        stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Stripe webhook signature: {exc}") from exc

    # The signature is checked; read the event as plain JSON. SDK objects changed shape between
    # stripe-python versions (no dict methods), which made every subscription event fail with 500.
    event = json.loads(payload)
    event_type = event.get("type", "")
    data_object = (event.get("data") or {}).get("object")

    if event_type == "checkout.session.completed" and data_object:
        org_id_raw = data_object.get("client_reference_id") or (data_object.get("metadata") or {}).get("organization_id")
        if org_id_raw:
            try:
                organization_id = UUID(org_id_raw)
            except ValueError:
                organization_id = None
            if organization_id is not None:
                subscription = _get_subscription(db, organization_id)
                subscription.stripe_customer_id = data_object.get("customer") or subscription.stripe_customer_id
                subscription.stripe_subscription_id = data_object.get("subscription") or subscription.stripe_subscription_id
                db.add(subscription)

    if event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"} and data_object:
        updated = _upsert_subscription_from_stripe(db, data_object)
        # A plan switch in the customer portal leaves the Pro add-on as it was; bring it in line.
        if updated is not None and event_type != "customer.subscription.deleted":
            sync_stripe_locations(db, updated.organization_id)
        if updated is not None:
            organization = db.get(Organization, updated.organization_id)
            if organization is not None:
                metadata = data_object.get("metadata") or {}
                if event_type == "customer.subscription.created" and metadata.get("referral_credit") == "1" and organization.referral_free_months:
                    organization.referral_free_months -= 1
                # A paying business rewards whoever invited it (once).
                if updated.status == SubscriptionStatusEnum.ACTIVE and updated.stripe_subscription_id:
                    referrals_service.reward_if_due(db, organization)

    if event_type == "invoice.payment_failed" and data_object:
        # Newer API versions moved the subscription id under parent.subscription_details.
        parent = (data_object.get("parent") or {}).get("subscription_details") or {}
        stripe_subscription_id = data_object.get("subscription") or parent.get("subscription")
        if stripe_subscription_id:
            subscription = db.scalar(
                select(OrganizationSubscription).where(OrganizationSubscription.stripe_subscription_id == stripe_subscription_id)
            )
            if subscription is not None:
                subscription.status = SubscriptionStatusEnum.PAST_DUE
                db.add(subscription)

    db.commit()
    return ok({"received": True, "event_type": event_type})
