"""Plan rules: Free for one small location; Starter and Pro are billed per location (Stripe quantity = locations)."""

from __future__ import annotations

from datetime import UTC, datetime
from importlib import import_module
import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Location, OrganizationMembership, OrganizationSubscription, SubscriptionPlanEnum, SubscriptionStatusEnum
from app.schemas import SubscriptionSummaryOut

logger = logging.getLogger("gastrowo.billing")

FREE_MEMBER_LIMIT = 15
FREE_LOCATION_LIMIT = 1
# Starter covers up to 30 people per paid location; Pro has no people limit.
STARTER_MEMBERS_PER_LOCATION = 30
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
        return STARTER_MEMBERS_PER_LOCATION * max(locations, 1)
    return None


def location_cap_for(plan: SubscriptionPlanEnum) -> int | None:
    return FREE_LOCATION_LIMIT if plan == SubscriptionPlanEnum.FREE else None


def count_members(db: Session, organization_id: UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)
    ) or 0


def require_location_slot(db: Session, organization_id: UUID) -> None:
    """Free covers one location; more locations need a paid plan (priced per location)."""
    cap = location_cap_for(organization_plan(db, organization_id))
    if cap is not None and count_locations(db, organization_id) >= cap:
        raise HTTPException(status_code=402, detail="The Free plan includes one location. Upgrade to Starter to add more.")


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
        has_payment_method=bool(subscription.stripe_subscription_id),
        features=allowed_features(plan),
    )


def sync_stripe_locations(db: Session, organization_id: UUID) -> None:
    """Keep the Stripe quantity equal to the number of locations. Best effort: never blocks changes."""
    subscription = db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization_id))
    if subscription is None or not subscription.stripe_subscription_id or not settings.stripe_secret_key:
        return
    try:
        stripe = import_module("stripe")
        stripe.api_key = settings.stripe_secret_key
        remote = stripe.Subscription.retrieve(subscription.stripe_subscription_id)
        items = remote["items"]["data"]
        if not items:
            return
        quantity = max(count_locations(db, organization_id), 1)
        if items[0]["quantity"] != quantity:
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                items=[{"id": items[0]["id"], "quantity": quantity}],
                proration_behavior="create_prorations",
            )
    except Exception:
        logger.exception("Failed to sync Stripe locations for organization %s", organization_id)
