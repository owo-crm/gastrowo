"""Referral program: invite another restaurant, both get a free month.

- The invited business signs up through a link with ?ref=CODE and gets 30 extra days of the Pro
  trial (60 instead of 30).
- When it starts paying, the inviter earns one free month: a 100%-off next invoice on an active
  Stripe subscription, 30 more trial days while on the trial, or a credit used at their checkout.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from importlib import import_module
import logging
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Organization, OrganizationMembership, OrganizationSubscription, RoleEnum, SubscriptionStatusEnum
from app.services.billing import get_or_create_subscription
from app.services.notifications import notify_users

logger = logging.getLogger("gastrowo.referrals")

BONUS_TRIAL_DAYS = 30
FREE_MONTH_DAYS = 30
COUPON_ID = "platofy-referral-free-month"
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def code_for(db: Session, organization: Organization) -> str:
    if not organization.referral_code:
        while True:
            code = "".join(secrets.choice(_ALPHABET) for _ in range(8))
            if db.scalar(select(Organization.id).where(Organization.referral_code == code)) is None:
                break
        organization.referral_code = code
        db.flush()
    return organization.referral_code


def resolve(db: Session, code: str | None) -> Organization | None:
    cleaned = (code or "").strip().upper()
    if not cleaned:
        return None
    organization = db.scalar(select(Organization).where(Organization.referral_code == cleaned))
    return None if organization is None or organization.is_sandbox else organization


def _stripe():
    if not settings.stripe_secret_key:
        return None
    try:
        stripe = import_module("stripe")
    except ImportError:
        return None
    stripe.api_key = settings.stripe_secret_key
    return stripe


def free_month_coupon(stripe) -> str:
    """A reusable 100%-off-once coupon; created on first use."""
    try:
        stripe.Coupon.retrieve(COUPON_ID)
    except Exception:
        stripe.Coupon.create(id=COUPON_ID, percent_off=100, duration="once", name="Referral: one free month")
    return COUPON_ID


def _notify_owners(db: Session, organization: Organization, title: str, body: str) -> None:
    owners = db.scalars(
        select(OrganizationMembership.user_id).where(OrganizationMembership.organization_id == organization.id, OrganizationMembership.role == RoleEnum.ADMIN)
    ).all()
    notify_users(db, organization.id, owners, title, body, action_url="/settings/referrals")


def grant_free_month(db: Session, organization: Organization) -> str:
    """Give one free month the best way the business's billing allows. Returns how it was applied."""
    subscription = get_or_create_subscription(db, organization.id)
    now = datetime.now(UTC)
    if subscription.stripe_subscription_id and subscription.status in (SubscriptionStatusEnum.ACTIVE, SubscriptionStatusEnum.PAST_DUE):
        stripe = _stripe()
        if stripe is not None:
            try:
                stripe.Subscription.modify(subscription.stripe_subscription_id, discounts=[{"coupon": free_month_coupon(stripe)}])
                return "next_invoice_free"
            except Exception:
                logger.exception("Could not apply the referral coupon for organization %s", organization.id)
    trial_end = _utc(subscription.trial_ends_at)
    if subscription.status == SubscriptionStatusEnum.TRIALING and not subscription.stripe_subscription_id and trial_end and trial_end > now:
        subscription.trial_ends_at = trial_end + timedelta(days=FREE_MONTH_DAYS)
        subscription.current_period_ends_at = subscription.trial_ends_at
        return "trial_extended"
    organization.referral_free_months = (organization.referral_free_months or 0) + 1
    return "credit"


def reward_if_due(db: Session, referred: Organization) -> bool:
    """Called when a business's subscription is active and paid: reward whoever invited it, once."""
    if referred.referred_by_id is None or referred.referral_rewarded_at is not None:
        return False
    referrer = db.get(Organization, referred.referred_by_id)
    if referrer is None:
        return False
    referred.referral_rewarded_at = datetime.now(UTC)
    how = grant_free_month(db, referrer)
    detail = {
        "next_invoice_free": "Your next invoice is on us.",
        "trial_extended": "Your Pro trial got 30 more days.",
        "credit": "It will be applied when you choose a plan.",
    }[how]
    _notify_owners(db, referrer, "You earned a free month", f"{referred.name} started using Platofy through your link. {detail}")
    return True


def summary(db: Session, organization: Organization) -> dict:
    referred = db.scalars(select(Organization).where(Organization.referred_by_id == organization.id).order_by(Organization.created_at.desc())).all()
    return {
        "code": code_for(db, organization),
        "path": f"/?ref={organization.referral_code}",
        "joined": len(referred),
        "paying": sum(1 for item in referred if item.referral_rewarded_at is not None),
        "free_months_waiting": organization.referral_free_months or 0,
        "businesses": [{"name": item.name, "paying": item.referral_rewarded_at is not None} for item in referred[:50]],
        "bonus_trial_days": BONUS_TRIAL_DAYS,
    }


def count_referred(db: Session, organization_id) -> int:
    return db.scalar(select(func.count()).select_from(Organization).where(Organization.referred_by_id == organization_id)) or 0
