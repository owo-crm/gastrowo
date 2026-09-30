"""The owner's "Get started" roadmap: each step ticks itself off from real data."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import (
    AvailabilityWeek,
    ClockSession,
    InviteToken,
    Location,
    Organization,
    OrganizationMembership,
    PositionCatalog,
    PushSubscription,
    RevenueReport,
    RoleEnum,
    Shift,
    ShiftSourceEnum,
    ShiftTemplate,
    Timesheet,
    User,
)

# (key, where the owner goes to do it) — order is the order to learn the app in.
STEPS: tuple[tuple[str, str], ...] = (
    ("profile", "/settings"),
    ("location", "/team/locations"),
    ("positions", "/team/positions"),
    ("invite", "/team/invites"),
    ("joined", "/team"),
    ("templates", "/team/templates"),
    ("availability", "/schedule/availability"),
    ("auto_schedule", "/schedule"),
    ("notifications", "/settings"),
    ("clock_in", "/settings/business"),
    ("approved_hours", "/schedule/hours"),
    ("revenue", "/overview/revenue"),
)


# The "Get started" tab is temporary: it goes away by itself two weeks after the business was created.
ROADMAP_DAYS = 14


def roadmap_is_hidden(organization: Organization) -> bool:
    if organization.roadmap_hidden_at is not None:
        return True
    created = organization.created_at
    if created is None:
        return False
    created = created if created.tzinfo else created.replace(tzinfo=UTC)
    return created < datetime.now(UTC) - timedelta(days=ROADMAP_DAYS)


def roadmap(db: Session, organization: Organization, user: User) -> dict:
    org_id: UUID = organization.id

    def any_(query) -> bool:
        return bool(db.scalar(select(exists(query))))

    staff = select(OrganizationMembership.id).where(OrganizationMembership.organization_id == org_id, OrganizationMembership.role != RoleEnum.ADMIN)
    done = {
        "profile": bool(user.avatar_url),
        "location": any_(select(Location.id).where(Location.organization_id == org_id, Location.name != "Main Location")),
        "positions": any_(select(PositionCatalog.id).where(PositionCatalog.organization_id == org_id, PositionCatalog.is_active.is_(True))),
        "invite": any_(select(InviteToken.id).where(InviteToken.organization_id == org_id)) or any_(staff),
        "joined": any_(staff),
        "templates": any_(select(ShiftTemplate.id).where(ShiftTemplate.organization_id == org_id)),
        "availability": any_(
            select(AvailabilityWeek.id).where(AvailabilityWeek.organization_id == org_id, AvailabilityWeek.user_id != user.id)
        ),
        "auto_schedule": any_(select(Shift.id).where(Shift.organization_id == org_id, Shift.source == ShiftSourceEnum.AUTO)),
        "notifications": any_(select(PushSubscription.id).where(PushSubscription.user_id == user.id)),
        "clock_in": any_(select(ClockSession.id).where(ClockSession.organization_id == org_id)),
        "approved_hours": any_(select(Timesheet.id).where(Timesheet.organization_id == org_id, Timesheet.reviewed_by.is_not(None))),
        "revenue": any_(select(RevenueReport.id).where(RevenueReport.organization_id == org_id)),
    }
    steps = [{"key": key, "to": to, "done": done[key]} for key, to in STEPS]
    return {
        "hidden": roadmap_is_hidden(organization),
        "done_count": sum(1 for step in steps if step["done"]),
        "total": len(steps),
        "steps": steps,
    }
