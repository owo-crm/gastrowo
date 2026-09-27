"""Plan rules: Free for small teams, Pro billed per active team member, locations never limited."""

from __future__ import annotations

from datetime import UTC, datetime
from importlib import import_module
import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Location, OrganizationMembership, OrganizationSubscription, SubscriptionPlanEnum, SubscriptionStatusEnum
from app.schemas import SubscriptionSummaryOut

logger = logging.getLogger("gastrowo.billing")

FREE_MEMBER_LIMIT = 5


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


def member_cap_for(plan: SubscriptionPlanEnum) -> int | None:
    return FREE_MEMBER_LIMIT if plan == SubscriptionPlanEnum.FREE else None


def count_members(db: Session, organization_id: UUID) -> int:
    return db.scalar(
        select(func.count()).select_from(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)
    ) or 0


def build_subscription_summary(db: Session, organization_id: UUID | None) -> SubscriptionSummaryOut | None:
    if organization_id is None:
        return None
    subscription = get_or_create_subscription(db, organization_id)
    plan, status = effective_plan(subscription)
    members = count_members(db, organization_id)
    locations = db.scalar(select(func.count()).select_from(Location).where(Location.organization_id == organization_id)) or 0
    member_cap = member_cap_for(plan)
    return SubscriptionSummaryOut(
        plan=plan,
        status=status,
        billing_cycle=subscription.billing_cycle,
        trial_ends_at=subscription.trial_ends_at,
        current_period_ends_at=subscription.current_period_ends_at,
        active_members_count=members,
        active_locations_count=locations,
        member_cap=member_cap,
        location_cap=None,
        soft_limit_reached=member_cap is not None and members >= member_cap,
        billable_seats=max(members, 1),
        has_payment_method=bool(subscription.stripe_subscription_id),
    )


def sync_stripe_seats(db: Session, organization_id: UUID) -> None:
    """Keep the Stripe subscription quantity equal to the team size. Best effort: never blocks team changes."""
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
        seats = max(count_members(db, organization_id), 1)
        if items[0]["quantity"] != seats:
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                items=[{"id": items[0]["id"], "quantity": seats}],
                proration_behavior="create_prorations",
            )
    except Exception:
        logger.exception("Failed to sync Stripe seats for organization %s", organization_id)
