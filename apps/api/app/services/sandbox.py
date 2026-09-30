"""Public "demo look": each visitor gets their own throwaway business with a month of made-up data.

Nothing is shared: every visitor gets a separate business, other visitors and real businesses can't see
it, and it is deleted when it expires. Features that would confuse a visitor or reach the outside world
(kiosk, billing, invites, push) are refused for sandbox businesses by `SANDBOX_BLOCKED` in main.py.
"""

from __future__ import annotations

import logging
import re
import secrets
import time as time_module
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    SupportMessage,
    SupportThread,
    Assignment,
    AuthSession,
    AvailabilitySlot,
    AvailabilityWeek,
    ClockSession,
    InAppNotification,
    InviteToken,
    KioskDevice,
    Location,
    LocationMembership,
    MemberPosition,
    Organization,
    OrganizationMembership,
    OrganizationSubscription,
    PlatformAuditLog,
    PositionCatalog,
    PushSubscription,
    RevenueReport,
    RoleEnum,
    ScheduleWeeklyOverride,
    Shift,
    ShiftRequest,
    ShiftTemplate,
    Task,
    TaskPhoto,
    Timesheet,
    User,
)
from app.services.demo_restaurant import DEMO_EMAIL_DOMAIN, seed_demo_restaurant
from app.services.labor_rules import default_timezone_for

logger = logging.getLogger("workdish.sandbox")

SANDBOX_BUSINESS = {"US": ("Brooklyn Diner", "Alex Morgan"), "PL": ("Bistro Pod Lipami", "Ola Nowicka")}

# (method, path pattern) a sandbox business may not call.
SANDBOX_BLOCKED: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (method, re.compile(pattern))
    for method, pattern in (
        ("POST", r"^/clock/kiosks/?$"),
        ("PATCH", r"^/clock/kiosks/[^/]+$"),
        ("POST", r"^/billing/(checkout|portal)-session$"),
        ("POST", r"^/organizations/?$"),
        ("POST", r"^/organizations/members/(link-by-email|import)$"),
        ("POST", r"^/organizations/current/demo-restaurant$"),
        ("POST", r"^/push/subscribe$"),
        # A public demo is anonymous: no support chat (it would be an open channel to the team).
        ("POST", r"^/support/messages$"),
    )
)

_created_by_ip: dict[str, list[float]] = {}


def is_blocked(method: str, path: str) -> bool:
    return any(method == blocked_method and pattern.match(path) for blocked_method, pattern in SANDBOX_BLOCKED)


def check_rate(ip: str) -> None:
    """At most a few new demos per IP per hour, so nobody fills the database. In-memory per process."""
    now = time_module.monotonic()
    recent = [moment for moment in _created_by_ip.get(ip, []) if now - moment < 3600]
    if len(recent) >= settings.public_demo_per_ip_per_hour:
        raise PermissionError("Too many demos from this network. Try again in an hour.")
    recent.append(now)
    _created_by_ip[ip] = recent


def live_count(db: Session) -> int:
    return db.scalar(select(func.count(Organization.id)).where(Organization.is_sandbox.is_(True))) or 0


def create_sandbox(db: Session, country: str) -> tuple[User, OrganizationMembership, Organization]:
    country = "PL" if country == "PL" else "US"
    business, owner_name = SANDBOX_BUSINESS[country]
    code = secrets.token_hex(4)
    organization = Organization(
        name=f"{business} · demo {code}",
        country=country,
        is_sandbox=True,
        sandbox_expires_at=datetime.now(UTC) + timedelta(hours=settings.public_demo_hours),
    )
    owner = User(email=f"visitor.{code}.{secrets.token_hex(4)}@{DEMO_EMAIL_DOMAIN}", full_name=owner_name, password_hash="", onboarding_source="public-demo")
    db.add_all([organization, owner])
    db.flush()
    membership = OrganizationMembership(organization_id=organization.id, user_id=owner.id, role=RoleEnum.ADMIN, max_hours_per_week=60)
    location = Location(organization_id=organization.id, name=business, timezone=default_timezone_for(country))
    db.add_all([membership, location])
    db.flush()
    db.add(LocationMembership(location_id=location.id, user_id=owner.id))
    db.commit()
    seed_demo_restaurant(db, organization, owner, past_weeks=4, sandbox=True)
    db.refresh(membership)
    return owner, membership, organization


def delete_sandbox(db: Session, organization_id: UUID) -> None:
    organization = db.get(Organization, organization_id)
    if organization is None or not organization.is_sandbox:
        return
    user_ids = list(db.scalars(select(OrganizationMembership.user_id).where(OrganizationMembership.organization_id == organization_id)).all())
    # Only people who belong to nothing else are removed with it (all of them, in practice).
    other = set(
        db.scalars(
            select(OrganizationMembership.user_id).where(OrganizationMembership.user_id.in_(user_ids), OrganizationMembership.organization_id != organization_id)
        ).all()
    ) if user_ids else set()
    user_ids = [item for item in user_ids if item not in other]

    shift_ids = select(Shift.id).where(Shift.organization_id == organization_id)
    task_ids = select(Task.id).where(Task.organization_id == organization_id)
    week_ids = select(AvailabilityWeek.id).where(AvailabilityWeek.organization_id == organization_id)
    location_ids = select(Location.id).where(Location.organization_id == organization_id)
    for statement in (
        delete(ClockSession).where(ClockSession.organization_id == organization_id),
        delete(ShiftRequest).where(ShiftRequest.organization_id == organization_id),
        delete(Timesheet).where(Timesheet.organization_id == organization_id),
        delete(Assignment).where(Assignment.shift_id.in_(shift_ids)),
        delete(ScheduleWeeklyOverride).where(ScheduleWeeklyOverride.organization_id == organization_id),
        delete(Shift).where(Shift.organization_id == organization_id),
        delete(ShiftTemplate).where(ShiftTemplate.organization_id == organization_id),
        delete(TaskPhoto).where(TaskPhoto.task_id.in_(task_ids)),
        delete(Task).where(Task.organization_id == organization_id),
        delete(RevenueReport).where(RevenueReport.organization_id == organization_id),
        delete(KioskDevice).where(KioskDevice.organization_id == organization_id),
        delete(AvailabilitySlot).where(AvailabilitySlot.week_id.in_(week_ids)),
        delete(AvailabilityWeek).where(AvailabilityWeek.organization_id == organization_id),
        delete(InAppNotification).where(InAppNotification.organization_id == organization_id),
        delete(SupportMessage).where(SupportMessage.thread_id.in_(select(SupportThread.id).where(SupportThread.organization_id == organization_id))),
        delete(SupportThread).where(SupportThread.organization_id == organization_id),
        delete(InviteToken).where(InviteToken.organization_id == organization_id),
        delete(MemberPosition).where(MemberPosition.organization_id == organization_id),
        delete(LocationMembership).where(LocationMembership.location_id.in_(location_ids)),
        delete(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id),
        delete(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization_id),
        delete(PlatformAuditLog).where(PlatformAuditLog.organization_id == organization_id),
        delete(PositionCatalog).where(PositionCatalog.organization_id == organization_id),
        delete(AuthSession).where(AuthSession.organization_id == organization_id),
        delete(Location).where(Location.organization_id == organization_id),
    ):
        db.execute(statement)
    if user_ids:
        db.execute(delete(AuthSession).where(AuthSession.user_id.in_(user_ids)))
        db.execute(delete(PushSubscription).where(PushSubscription.user_id.in_(user_ids)))
        db.execute(delete(User).where(User.id.in_(user_ids)))
    db.execute(delete(Organization).where(Organization.id == organization_id))
    db.commit()


def cleanup_expired(db: Session) -> int:
    expired = db.scalars(
        select(Organization.id).where(Organization.is_sandbox.is_(True), Organization.sandbox_expires_at < datetime.now(UTC))
    ).all()
    for organization_id in expired:
        try:
            delete_sandbox(db, organization_id)
        except Exception:  # noqa: BLE001 - one broken sandbox must not stop the rest
            db.rollback()
            logger.exception("Could not delete expired demo %s", organization_id)
    return len(expired)
