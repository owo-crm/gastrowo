"""Platform admin panel: every business on Plato, their subscriptions, and a log of what was changed.

Only emails in PLATFORM_ADMIN_EMAILS get in. Changes to a business with a live Stripe subscription are
mirrored to Stripe where Stripe has an equivalent (free days, coupon, cancel); the local record is the
source of truth for businesses without one.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from importlib import import_module
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.envelope import ok
from app.db import get_db
from app.models import (
    Location,
    Organization,
    OrganizationMembership,
    OrganizationSubscription,
    PlatformAuditLog,
    RoleEnum,
    SubscriptionPlanEnum,
    SubscriptionStatusEnum,
    User,
)
from app.services.billing import effective_plan, get_or_create_subscription

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/platform", tags=["platform"])


def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() not in settings.parsed_platform_admin_emails:
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return user


class SubscriptionAction(BaseModel):
    action: Literal["extend", "set_plan", "cancel", "discount", "remove_discount", "note"]
    days: int | None = Field(default=None, ge=1, le=3650)
    plan: Literal["free", "standard", "pro"] | None = None
    percent: int | None = Field(default=None, ge=1, le=100)
    months: int | None = Field(default=None, ge=1, le=36)
    note: str | None = Field(default=None, max_length=2000)


class DeleteRequest(BaseModel):
    confirm_name: str


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _stripe():
    if not settings.stripe_secret_key:
        return None
    try:
        stripe = import_module("stripe")
    except ImportError:
        return None
    stripe.api_key = settings.stripe_secret_key
    return stripe


def _log(db: Session, actor: User, organization: Organization, action: str, detail: dict) -> None:
    db.add(
        PlatformAuditLog(
            actor_email=actor.email,
            organization_id=organization.id,
            organization_name=organization.name,
            action=action,
            detail=json.dumps(detail, default=str),
        )
    )


def _owners(db: Session, organization_id: UUID) -> list[str]:
    return list(
        db.scalars(
            select(User.email)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .where(OrganizationMembership.organization_id == organization_id, OrganizationMembership.role == RoleEnum.ADMIN)
        ).all()
    )


def _row(db: Session, organization: Organization, members: int, locations: int) -> dict:
    subscription = get_or_create_subscription(db, organization.id)
    plan, status = effective_plan(subscription)
    return {
        "id": str(organization.id),
        "name": organization.name,
        "country": organization.country,
        "created_at": organization.created_at.isoformat() if organization.created_at else None,
        "owners": _owners(db, organization.id),
        "members": members,
        "locations": locations,
        "plan": plan.value,
        "stored_plan": subscription.plan.value,
        "status": status.value,
        "trial_ends_at": _utc(subscription.trial_ends_at).isoformat() if subscription.trial_ends_at else None,
        "current_period_ends_at": _utc(subscription.current_period_ends_at).isoformat() if subscription.current_period_ends_at else None,
        "has_stripe": bool(subscription.stripe_subscription_id),
        "discount_percent": subscription.discount_percent,
        "discount_months": subscription.discount_months,
        "admin_note": subscription.admin_note,
    }


def _counts(db: Session) -> tuple[dict[UUID, int], dict[UUID, int]]:
    members = dict(db.execute(select(OrganizationMembership.organization_id, func.count()).group_by(OrganizationMembership.organization_id)).all())
    locations = dict(db.execute(select(Location.organization_id, func.count()).group_by(Location.organization_id)).all())
    return members, locations


@router.get("/stats")
def platform_stats(_: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    organizations = db.scalars(select(Organization)).all()
    by_plan: dict[str, int] = {}
    paying = trialing = 0
    for organization in organizations:
        subscription = get_or_create_subscription(db, organization.id)
        plan, status = effective_plan(subscription)
        by_plan[plan.value] = by_plan.get(plan.value, 0) + 1
        paying += int(bool(subscription.stripe_subscription_id) and status == SubscriptionStatusEnum.ACTIVE)
        trialing += int(status == SubscriptionStatusEnum.TRIALING)
    db.commit()
    return ok(
        {
            "businesses": len(organizations),
            "people": db.scalar(select(func.count()).select_from(OrganizationMembership)) or 0,
            "paying": paying,
            "trialing": trialing,
            "by_plan": by_plan,
        }
    )


@router.get("/organizations")
def list_organizations(q: str = "", _: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    query = select(Organization).order_by(Organization.created_at.desc())
    term = q.strip().lower()
    if term:
        owner_org_ids = select(OrganizationMembership.organization_id).join(User, User.id == OrganizationMembership.user_id).where(func.lower(User.email).contains(term))
        query = query.where(or_(func.lower(Organization.name).contains(term), Organization.id.in_(owner_org_ids)))
    organizations = db.scalars(query.limit(200)).all()
    members, locations = _counts(db)
    rows = [_row(db, organization, members.get(organization.id, 0), locations.get(organization.id, 0)) for organization in organizations]
    db.commit()
    return ok(rows)


@router.get("/organizations/{organization_id}")
def get_organization(organization_id: UUID, _: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Business not found")
    members, locations = _counts(db)
    log = db.scalars(
        select(PlatformAuditLog).where(PlatformAuditLog.organization_id == organization_id).order_by(PlatformAuditLog.created_at.desc()).limit(50)
    ).all()
    row = _row(db, organization, members.get(organization.id, 0), locations.get(organization.id, 0))
    db.commit()
    return ok({**row, "log": [_log_out(item) for item in log]})


def _log_out(item: PlatformAuditLog) -> dict:
    return {
        "id": str(item.id),
        "actor_email": item.actor_email,
        "organization_id": str(item.organization_id) if item.organization_id else None,
        "organization_name": item.organization_name,
        "action": item.action,
        "detail": json.loads(item.detail or "{}"),
        "created_at": item.created_at.isoformat(),
    }


@router.get("/audit")
def audit_log(limit: int = 50, _: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(PlatformAuditLog).order_by(PlatformAuditLog.created_at.desc()).limit(min(max(limit, 1), 200))).all()
    return ok([_log_out(item) for item in rows])


def _apply_extend(db: Session, subscription: OrganizationSubscription, days: int) -> dict:
    now = datetime.now(UTC)
    detail: dict = {"days": days}
    if subscription.stripe_subscription_id:
        # Paying customer: push their next charge back, which Stripe treats as free days.
        current_end = _utc(subscription.current_period_ends_at) or now
        new_end = max(current_end, now) + timedelta(days=days)
        subscription.current_period_ends_at = new_end
        stripe = _stripe()
        if stripe is not None:
            try:
                stripe.Subscription.modify(subscription.stripe_subscription_id, trial_end=int(new_end.timestamp()), proration_behavior="none")
                detail["stripe"] = "next charge moved"
            except Exception as exc:  # pragma: no cover - network
                logger.exception("Stripe extend failed")
                detail["stripe_error"] = str(exc)[:200]
        detail["until"] = new_end.isoformat()
        return detail
    # No Stripe: paid access (Pro unless already on a paid plan) until the new date, then back to Free.
    if subscription.plan == SubscriptionPlanEnum.FREE:
        subscription.plan = SubscriptionPlanEnum.PRO
    start = _utc(subscription.trial_ends_at) if subscription.status == SubscriptionStatusEnum.TRIALING else None
    new_end = max(start or now, now) + timedelta(days=days)
    subscription.status = SubscriptionStatusEnum.TRIALING
    subscription.trial_ends_at = new_end
    subscription.current_period_ends_at = None
    detail.update({"plan": subscription.plan.value, "until": new_end.isoformat()})
    return detail


def _apply_discount(subscription: OrganizationSubscription, percent: int, months: int, organization: Organization) -> dict:
    subscription.discount_percent = percent
    subscription.discount_months = months
    subscription.stripe_coupon_id = None
    detail: dict = {"percent": percent, "months": months}
    stripe = _stripe()
    if stripe is None:
        detail["stripe"] = "not configured; applied at checkout once Stripe is set up"
        return detail
    try:
        coupon = stripe.Coupon.create(
            percent_off=percent,
            duration="forever" if percent == 100 and months >= 36 else "repeating",
            duration_in_months=None if percent == 100 and months >= 36 else months,
            name=f"Plato {percent}% · {organization.name}"[:40],
            metadata={"organization_id": str(organization.id)},
        )
        subscription.stripe_coupon_id = coupon["id"]
        if subscription.stripe_subscription_id:
            stripe.Subscription.modify(subscription.stripe_subscription_id, discounts=[{"coupon": coupon["id"]}])
            detail["stripe"] = "applied to the live subscription"
        else:
            detail["stripe"] = "applied at their next checkout"
    except Exception as exc:  # pragma: no cover - network
        logger.exception("Stripe discount failed")
        detail["stripe_error"] = str(exc)[:200]
    return detail


@router.post("/organizations/{organization_id}/subscription")
def change_subscription(
    organization_id: UUID,
    payload: SubscriptionAction,
    actor: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Business not found")
    subscription = get_or_create_subscription(db, organization.id)

    if payload.action == "extend":
        if not payload.days:
            raise HTTPException(status_code=422, detail="days is required")
        detail = _apply_extend(db, subscription, payload.days)
    elif payload.action == "set_plan":
        if payload.plan is None:
            raise HTTPException(status_code=422, detail="plan is required")
        subscription.plan = SubscriptionPlanEnum(payload.plan)
        if payload.plan == "free":
            subscription.status = SubscriptionStatusEnum.ACTIVE
            subscription.trial_ends_at = None
        elif payload.days:
            subscription.status = SubscriptionStatusEnum.TRIALING
            subscription.trial_ends_at = datetime.now(UTC) + timedelta(days=payload.days)
        else:
            # Forever: no end date, nothing to pay (tests, partners, special offers).
            subscription.status = SubscriptionStatusEnum.ACTIVE
            subscription.trial_ends_at = None
            subscription.current_period_ends_at = None
        detail = {"plan": payload.plan, "days": payload.days or "forever"}
        if subscription.stripe_subscription_id:
            detail["warning"] = "has a Stripe subscription; Stripe may overwrite this on its next event"
    elif payload.action == "cancel":
        detail = {}
        if subscription.stripe_subscription_id:
            stripe = _stripe()
            if stripe is not None:
                try:
                    stripe.Subscription.cancel(subscription.stripe_subscription_id)
                    detail["stripe"] = "cancelled"
                except Exception as exc:  # pragma: no cover - network
                    logger.exception("Stripe cancel failed")
                    detail["stripe_error"] = str(exc)[:200]
            subscription.stripe_subscription_id = None
        subscription.plan = SubscriptionPlanEnum.FREE
        subscription.status = SubscriptionStatusEnum.ACTIVE
        subscription.trial_ends_at = None
        subscription.current_period_ends_at = None
    elif payload.action == "discount":
        if not payload.percent or not payload.months:
            raise HTTPException(status_code=422, detail="percent and months are required")
        detail = _apply_discount(subscription, payload.percent, payload.months, organization)
    elif payload.action == "remove_discount":
        detail = {"percent": subscription.discount_percent}
        if subscription.stripe_subscription_id and subscription.stripe_coupon_id:
            stripe = _stripe()
            if stripe is not None:
                try:
                    stripe.Subscription.modify(subscription.stripe_subscription_id, discounts=[])
                except Exception as exc:  # pragma: no cover - network
                    detail["stripe_error"] = str(exc)[:200]
        subscription.discount_percent = None
        subscription.discount_months = None
        subscription.stripe_coupon_id = None
    else:
        subscription.admin_note = (payload.note or "").strip() or None
        detail = {"note": subscription.admin_note}

    _log(db, actor, organization, payload.action, detail)
    db.commit()
    members, locations = _counts(db)
    return ok({**_row(db, organization, members.get(organization.id, 0), locations.get(organization.id, 0)), "detail": detail})


@router.delete("/organizations/{organization_id}")
def delete_organization(
    organization_id: UUID,
    payload: DeleteRequest,
    actor: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    """Delete a business and everything in it. People who belonged only to it are deleted too."""
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Business not found")
    if payload.confirm_name.strip() != organization.name:
        raise HTTPException(status_code=422, detail="Type the business name exactly to delete it")
    if any(email.lower() == actor.email.lower() for email in _owners(db, organization.id)):
        raise HTTPException(status_code=422, detail="This is your own business. Use the demo reset instead.")

    subscription = get_or_create_subscription(db, organization.id)
    detail: dict = {"members": 0}
    if subscription.stripe_subscription_id:
        stripe = _stripe()
        if stripe is not None:
            try:
                stripe.Subscription.cancel(subscription.stripe_subscription_id)
                detail["stripe"] = "cancelled"
            except Exception as exc:  # pragma: no cover - network
                detail["stripe_error"] = str(exc)[:200]

    user_ids = list(db.scalars(select(OrganizationMembership.user_id).where(OrganizationMembership.organization_id == organization.id)).all())
    detail["members"] = len(user_ids)
    _log(db, actor, organization, "delete_business", detail)
    db.flush()
    # The log row keeps the name; its link to the business is cleared when the business goes.
    db.execute(delete(OrganizationMembership).where(OrganizationMembership.organization_id == organization.id))
    db.delete(organization)
    db.flush()
    orphans = [user_id for user_id in user_ids if db.scalar(select(OrganizationMembership.id).where(OrganizationMembership.user_id == user_id)) is None]
    if orphans:
        db.execute(delete(User).where(User.id.in_(orphans)))
    db.commit()
    return ok({"deleted": True, **detail})
