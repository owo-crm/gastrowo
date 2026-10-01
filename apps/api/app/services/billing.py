"""Plan rules: Free and Starter cover one location; Pro includes three and bills each extra location as an add-on."""

from __future__ import annotations

from datetime import UTC, datetime
from importlib import import_module
import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Location, Organization, OrganizationMembership, OrganizationSubscription, SubscriptionPlanEnum, SubscriptionStatusEnum
from app.schemas import SubscriptionSummaryOut

logger = logging.getLogger("gastrowo.billing")

FREE_MEMBER_LIMIT = 15
FREE_LOCATION_LIMIT = 1
STARTER_MEMBER_LIMIT = 30
STARTER_LOCATION_LIMIT = 1
# Pro: no people limit, three locations in the base price, each further location is an add-on.
PRO_INCLUDED_LOCATIONS = 3
# New team members start as schedulable in every location (0 would exclude them from auto-planning).
DEFAULT_LOCATION_PRIORITY = 3

# Legacy Business/Enterprise subscriptions keep everything Pro has.
_PLAN_RANK = {
    SubscriptionPlanEnum.FREE: 0,
    SubscriptionPlanEnum.STANDARD: 1,
    SubscriptionPlanEnum.PRO: 2,
    SubscriptionPlanEnum.BUSINESS: 2,
    SubscriptionPlanEnum.ENTERPRISE: 2,
}

# Feature -> cheapest plan that includes it. Free keeps manual scheduling, availability, swaps and tasks.
FEATURE_MIN_PLAN = {
    "auto_schedule": SubscriptionPlanEnum.STANDARD,
    "timesheets": SubscriptionPlanEnum.STANDARD,
    "payroll": SubscriptionPlanEnum.PRO,
    "revenue": SubscriptionPlanEnum.PRO,
    "permissions": SubscriptionPlanEnum.PRO,
}

PLAN_NAMES = {SubscriptionPlanEnum.STANDARD: "Starter", SubscriptionPlanEnum.PRO: "Pro"}


def get_or_create_subscription(db: Session, organization_id: UUID) -> OrganizationSubscription:
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


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def effective_plan(subscription: OrganizationSubscription) -> tuple[SubscriptionPlanEnum, SubscriptionStatusEnum]:
    """Plan the workspace actually gets today: an unpaid trial that ran out falls back to Free."""
    if subscription.status in (SubscriptionStatusEnum.CANCELED, SubscriptionStatusEnum.EXPIRED):
        return SubscriptionPlanEnum.FREE, SubscriptionStatusEnum.ACTIVE
    trial_end = _utc(subscription.trial_ends_at)
    if (
        subscription.status == SubscriptionStatusEnum.TRIALING
        and not subscription.stripe_subscription_id
        and trial_end is not None
        and trial_end < datetime.now(UTC)
    ):
        return SubscriptionPlanEnum.FREE, SubscriptionStatusEnum.ACTIVE
    return subscription.plan, subscription.status


def plan_allows(plan: SubscriptionPlanEnum, feature: str) -> bool:
    return _PLAN_RANK[plan] >= _PLAN_RANK[FEATURE_MIN_PLAN[feature]]


def allowed_features(plan: SubscriptionPlanEnum) -> list[str]:
    return [feature for feature in FEATURE_MIN_PLAN if plan_allows(plan, feature)]


def organization_plan(db: Session, organization_id: UUID) -> SubscriptionPlanEnum:
    return effective_plan(get_or_create_subscription(db, organization_id))[0]


def require_feature(db: Session, organization_id: UUID, feature: str) -> None:
    if not plan_allows(organization_plan(db, organization_id), feature):
        plan_name = PLAN_NAMES[FEATURE_MIN_PLAN[feature]]
        raise HTTPException(status_code=402, detail=f"This feature is available from the {plan_name} plan")


def count_locations(db: Session, organization_id: UUID) -> int:
    return db.scalar(select(func.count()).select_from(Location).where(Location.organization_id == organization_id)) or 0


def member_cap_for(plan: SubscriptionPlanEnum, locations: int) -> int | None:
    if plan == SubscriptionPlanEnum.FREE:
        return FREE_MEMBER_LIMIT
    if plan == SubscriptionPlanEnum.STANDARD:
        return STARTER_MEMBER_LIMIT
    return None


def location_cap_for(plan: SubscriptionPlanEnum) -> int | None:
    if plan == SubscriptionPlanEnum.FREE:
        return FREE_LOCATION_LIMIT
    if plan == SubscriptionPlanEnum.STANDARD:
        return STARTER_LOCATION_LIMIT
    return None


def included_locations_for(plan: SubscriptionPlanEnum) -> int | None:
    """Locations covered by the base price; None when the plan has no location add-on."""
    return PRO_INCLUDED_LOCATIONS if _PLAN_RANK[plan] >= _PLAN_RANK[SubscriptionPlanEnum.PRO] else None


def extra_locations_for(plan: SubscriptionPlanEnum, locations: int) -> int:
    included = included_locations_for(plan)
    return max(locations - included, 0) if included is not None else 0


def count_members(db: Session, organization_id: UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)
    ) or 0


def require_location_slot(db: Session, organization_id: UUID) -> None:
    """Free and Starter cover one location; Pro includes three and bills each extra one as an add-on."""
    plan = organization_plan(db, organization_id)
    cap = location_cap_for(plan)
    if cap is not None and count_locations(db, organization_id) >= cap:
        plan_name = "Free" if plan == SubscriptionPlanEnum.FREE else PLAN_NAMES[SubscriptionPlanEnum.STANDARD]
        raise HTTPException(
            status_code=402,
            detail=f"The {plan_name} plan includes one location. Upgrade to Pro for up to {PRO_INCLUDED_LOCATIONS} locations.",
        )


def build_subscription_summary(db: Session, organization_id: UUID | None) -> SubscriptionSummaryOut | None:
    if organization_id is None:
        return None
    subscription = get_or_create_subscription(db, organization_id)
    plan, status = effective_plan(subscription)
    members = count_members(db, organization_id)
    locations = count_locations(db, organization_id)
    member_cap = member_cap_for(plan, locations)
    billable_locations = max(locations, 1)
    return SubscriptionSummaryOut(
        plan=plan,
        status=status,
        billing_cycle=subscription.billing_cycle,
        trial_ends_at=subscription.trial_ends_at,
        current_period_ends_at=subscription.current_period_ends_at,
        active_members_count=members,
        active_locations_count=locations,
        member_cap=member_cap,
        location_cap=location_cap_for(plan),
        soft_limit_reached=member_cap is not None and members >= member_cap,
        billable_seats=billable_locations,
        billable_locations=billable_locations,
        included_locations=included_locations_for(plan),
        extra_locations=extra_locations_for(plan, locations),
        has_payment_method=bool(subscription.stripe_subscription_id),
        features=allowed_features(plan),
        checkout_currency=checkout_currency_for(getattr(db.get(Organization, organization_id), "country", None)),
    )


def pln_prices_configured() -> bool:
    return all(
        (
            settings.stripe_price_starter_pln_monthly,
            settings.stripe_price_starter_pln_annual,
            settings.stripe_price_pro_pln_monthly,
            settings.stripe_price_pro_pln_annual,
            settings.stripe_price_pro_extra_location_pln_monthly,
            settings.stripe_price_pro_extra_location_pln_annual,
        )
    )


def checkout_currency_for(country: str | None) -> str:
    """Polish businesses pay in złoty once the PLN Stripe prices exist; everyone else (and until then) in dollars."""
    return "PLN" if (country or "US").upper() == "PL" and pln_prices_configured() else "USD"


def plan_price_table() -> dict[tuple[SubscriptionPlanEnum, str, str], str]:
    """(plan, billing cycle, currency) -> Stripe price id for the flat plan price (quantity 1)."""
    return {
        (SubscriptionPlanEnum.STANDARD, "monthly", "USD"): settings.stripe_price_starter_usd_monthly,
        (SubscriptionPlanEnum.STANDARD, "annual", "USD"): settings.stripe_price_starter_usd_annual,
        (SubscriptionPlanEnum.PRO, "monthly", "USD"): settings.stripe_price_pro_usd_monthly,
        (SubscriptionPlanEnum.PRO, "annual", "USD"): settings.stripe_price_pro_usd_annual,
        (SubscriptionPlanEnum.STANDARD, "monthly", "PLN"): settings.stripe_price_starter_pln_monthly,
        (SubscriptionPlanEnum.STANDARD, "annual", "PLN"): settings.stripe_price_starter_pln_annual,
        (SubscriptionPlanEnum.PRO, "monthly", "PLN"): settings.stripe_price_pro_pln_monthly,
        (SubscriptionPlanEnum.PRO, "annual", "PLN"): settings.stripe_price_pro_pln_annual,
    }


def extra_location_price_table() -> dict[tuple[str, str], str]:
    """(billing cycle, currency) -> Stripe price id for one Pro location beyond the included three."""
    return {
        ("monthly", "USD"): settings.stripe_price_pro_extra_location_usd_monthly,
        ("annual", "USD"): settings.stripe_price_pro_extra_location_usd_annual,
        ("monthly", "PLN"): settings.stripe_price_pro_extra_location_pln_monthly,
        ("annual", "PLN"): settings.stripe_price_pro_extra_location_pln_annual,
    }


def _price_id(item) -> str | None:
    price = item["price"] if "price" in item else None
    return price["id"] if price else None


def stripe_items_update(items: list, locations: int) -> list[dict]:
    """Changes that bring a Stripe subscription's items in line with the location count.

    The plan item always has quantity 1. A Pro subscription carries an add-on item whose quantity is the
    number of locations beyond the included three; it is added, resized or removed as locations change.
    """
    plans = {price: key for key, price in plan_price_table().items() if price}
    extras = {price for price in extra_location_price_table().values() if price}
    plan_item = next((item for item in items if _price_id(item) in plans), None)
    extra_item = next((item for item in items if _price_id(item) in extras), None)
    if plan_item is None:
        return []
    plan, cycle, currency = plans[_price_id(plan_item)]
    changes: list[dict] = []
    if plan_item["quantity"] != 1:
        changes.append({"id": plan_item["id"], "quantity": 1})
    wanted = extra_locations_for(plan, locations)
    if extra_item is not None:
        if wanted == 0:
            changes.append({"id": extra_item["id"], "deleted": True})
        elif extra_item["quantity"] != wanted:
            changes.append({"id": extra_item["id"], "quantity": wanted})
    elif wanted > 0:
        extra_price = extra_location_price_table().get((cycle, currency), "")
        if extra_price:
            changes.append({"price": extra_price, "quantity": wanted})
        else:
            logger.error("Pro extra-location price is not configured for %s/%s", cycle, currency)
    return changes


def sync_stripe_locations(db: Session, organization_id: UUID) -> None:
    """Keep the Stripe add-on quantity equal to the extra locations. Best effort: never blocks changes."""
    subscription = db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization_id))
    if subscription is None or not subscription.stripe_subscription_id or not settings.stripe_secret_key:
        return
    try:
        stripe = import_module("stripe")
        stripe.api_key = settings.stripe_secret_key
        remote = stripe.Subscription.retrieve(subscription.stripe_subscription_id)
        remote = remote.to_dict() if hasattr(remote, "to_dict") else remote
        changes = stripe_items_update(remote["items"]["data"], count_locations(db, organization_id))
        if changes:
            stripe.Subscription.modify(subscription.stripe_subscription_id, items=changes, proration_behavior="create_prorations")
    except Exception:
        logger.exception("Failed to sync Stripe locations for organization %s", organization_id)


def grant_comp_pro(db: Session, organization_id: UUID) -> OrganizationSubscription:
    """Free, never-ending Pro for the owner's own test workspace. Stripe fields are left alone."""
    subscription = get_or_create_subscription(db, organization_id)
    subscription.plan = SubscriptionPlanEnum.PRO
    subscription.status = SubscriptionStatusEnum.ACTIVE
    subscription.trial_ends_at = None
    subscription.current_period_ends_at = None
    db.flush()
    return subscription
