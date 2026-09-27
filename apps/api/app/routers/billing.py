from __future__ import annotations

from datetime import UTC, datetime
from importlib import import_module
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_business_settings
from app.db import get_db
from app.models import Organization, OrganizationSubscription, RoleEnum, SubscriptionPlanEnum, SubscriptionStatusEnum
from app.schemas import BillingCheckoutSessionOut, BillingCheckoutSessionRequest, BillingPortalSessionOut
from app.services.billing import count_members

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


def _price_id_for(plan: SubscriptionPlanEnum, billing_cycle: str) -> str:
    # Business prices remain in _plan_from_price_id only for existing subscriptions.
    mapping = {
        (SubscriptionPlanEnum.STANDARD, "monthly"): settings.stripe_price_standard_monthly,
        (SubscriptionPlanEnum.STANDARD, "annual"): settings.stripe_price_standard_annual,
        (SubscriptionPlanEnum.PRO, "monthly"): settings.stripe_price_pro_monthly,
        (SubscriptionPlanEnum.PRO, "annual"): settings.stripe_price_pro_annual,
    }
    price_id = mapping.get((plan, billing_cycle), "")
    if not price_id:
        raise HTTPException(status_code=503, detail=f"Stripe price is not configured for {plan.value}/{billing_cycle}")
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
    if raw_status in {"past_due", "unpaid", "incomplete"}:
        return SubscriptionStatusEnum.PAST_DUE
    if raw_status in {"canceled", "cancelled"}:
        return SubscriptionStatusEnum.CANCELED
    if raw_status == "incomplete_expired":
        return SubscriptionStatusEnum.EXPIRED
    return SubscriptionStatusEnum.ACTIVE


def _plan_from_price_id(price_id: str | None) -> tuple[SubscriptionPlanEnum, str] | None:
    reverse_mapping = {
        settings.stripe_price_standard_monthly: (SubscriptionPlanEnum.STANDARD, "monthly"),
        settings.stripe_price_standard_annual: (SubscriptionPlanEnum.STANDARD, "annual"),
        settings.stripe_price_pro_monthly: (SubscriptionPlanEnum.PRO, "monthly"),
        settings.stripe_price_pro_annual: (SubscriptionPlanEnum.PRO, "annual"),
        settings.stripe_price_business_monthly: (SubscriptionPlanEnum.BUSINESS, "monthly"),
        settings.stripe_price_business_annual: (SubscriptionPlanEnum.BUSINESS, "annual"),
    }
    if not price_id:
        return None
    return reverse_mapping.get(price_id)


def _upsert_subscription_from_stripe(db: Session, subscription_payload: Any) -> OrganizationSubscription | None:
    metadata = getattr(subscription_payload, "metadata", None) or {}
    org_id_raw = metadata.get("organization_id")
    stripe_subscription_id = getattr(subscription_payload, "id", None)
    stripe_customer_id = getattr(subscription_payload, "customer", None)

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

    items = getattr(getattr(subscription_payload, "items", None), "data", []) or []
    first_price_id = None
    if items:
        first_item = items[0]
        first_price_id = getattr(getattr(first_item, "price", None), "id", None)
    resolved_plan = _plan_from_price_id(first_price_id)
    if resolved_plan is not None:
        subscription.plan = resolved_plan[0]
        subscription.billing_cycle = resolved_plan[1]

    subscription.status = _status_from_stripe(getattr(subscription_payload, "status", None))
    subscription.stripe_customer_id = stripe_customer_id or subscription.stripe_customer_id
    subscription.stripe_subscription_id = stripe_subscription_id or subscription.stripe_subscription_id
    subscription.trial_ends_at = _datetime_from_unix(getattr(subscription_payload, "trial_end", None))
    subscription.current_period_ends_at = _datetime_from_unix(getattr(subscription_payload, "current_period_end", None))
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
        raise HTTPException(status_code=422, detail="Only the Standard and Pro plans can be purchased")
    if subscription.stripe_subscription_id:
        raise HTTPException(status_code=409, detail="This workspace already has a subscription; manage it in the billing portal")
    price_id = _price_id_for(payload.plan, payload.billing_cycle)
    # Paid plans are priced per team member; the quantity follows the team afterwards (sync_stripe_seats).
    seats = max(count_members(db, context.membership.organization_id), 1)

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": seats}],
        success_url=settings.billing_success_url,
        cancel_url=settings.billing_cancel_url,
        allow_promotion_codes=True,
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
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid Stripe webhook signature: {exc}") from exc

    event_type = getattr(event, "type", "")
    data_object = getattr(getattr(event, "data", None), "object", None)

    if event_type == "checkout.session.completed" and data_object is not None:
        org_id_raw = getattr(data_object, "client_reference_id", None) or (getattr(data_object, "metadata", None) or {}).get("organization_id")
        if org_id_raw:
            try:
                organization_id = UUID(org_id_raw)
            except ValueError:
                organization_id = None
            if organization_id is not None:
                subscription = _get_subscription(db, organization_id)
                subscription.stripe_customer_id = getattr(data_object, "customer", None) or subscription.stripe_customer_id
                subscription.stripe_subscription_id = getattr(data_object, "subscription", None) or subscription.stripe_subscription_id
                db.add(subscription)

    if event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"} and data_object is not None:
        _upsert_subscription_from_stripe(db, data_object)

    if event_type == "invoice.payment_failed" and data_object is not None:
        stripe_subscription_id = getattr(data_object, "subscription", None)
        if stripe_subscription_id:
            subscription = db.scalar(
                select(OrganizationSubscription).where(OrganizationSubscription.stripe_subscription_id == stripe_subscription_id)
            )
            if subscription is not None:
                subscription.status = SubscriptionStatusEnum.PAST_DUE
                db.add(subscription)

    db.commit()
    return ok({"received": True, "event_type": event_type})
