"""Clocking in and out, from a worker's phone or a shared tablet with a PIN.

A clock session runs from clock-in to clock-out. Closing it writes the timesheet entry the manager
already reviews today: when both ends are within a few minutes of the scheduled shift the entry is
approved on the spot, otherwise it waits in Hours like any other report.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Assignment,
    AssignmentStatusEnum,
    ClockSession,
    Location,
    LocationMembership,
    NotificationTypeEnum,
    Organization,
    OrganizationMembership,
    Shift,
    Timesheet,
    TimesheetStatusEnum,
    User,
)
from app.services.notifications import notify_admins_and_managers

CLOCK_MODES = ("phone", "kiosk", "both")
# Both ends this close to the schedule and the hours need no review.
AUTO_APPROVE_MINUTES = 10
# A clock-in this far around a shift's start counts as that shift.
MATCH_BEFORE = timedelta(hours=3)
MATCH_AFTER = timedelta(hours=4)


def pin_digest(organization_id: UUID, pin: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"{organization_id}:{pin}".encode(), hashlib.sha256).hexdigest()


def validate_pin(pin: str) -> str:
    pin = pin.strip()
    if not pin.isdigit() or not 4 <= len(pin) <= 6:
        raise HTTPException(status_code=422, detail="PIN must be 4 to 6 digits")
    return pin


def set_pin(db: Session, membership: OrganizationMembership, pin: str) -> None:
    digest = pin_digest(membership.organization_id, validate_pin(pin))
    taken = db.scalar(
        select(OrganizationMembership.id).where(
            OrganizationMembership.organization_id == membership.organization_id,
            OrganizationMembership.clock_pin_digest == digest,
            OrganizationMembership.id != membership.id,
        )
    )
    if taken is not None:
        raise HTTPException(status_code=409, detail="Someone on the team already uses this PIN. Pick another one.")
    membership.clock_pin_digest = digest


def generate_pin(db: Session, membership: OrganizationMembership) -> str:
    for _ in range(50):
        pin = f"{secrets.randbelow(10_000):04d}"
        try:
            set_pin(db, membership, pin)
            return pin
        except HTTPException:
            continue
    pin = f"{secrets.randbelow(1_000_000):06d}"
    set_pin(db, membership, pin)
    return pin


def membership_for_pin(db: Session, organization_id: UUID, pin: str) -> OrganizationMembership | None:
    return db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.clock_pin_digest == pin_digest(organization_id, pin.strip()),
        )
    )


def _zone(location: Location | None) -> ZoneInfo:
    try:
        return ZoneInfo(location.timezone) if location and location.timezone else ZoneInfo("UTC")
    except Exception:
        return ZoneInfo("UTC")


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def open_session(db: Session, organization_id: UUID, user_id: UUID) -> ClockSession | None:
    return db.scalar(
        select(ClockSession).where(
            ClockSession.organization_id == organization_id,
            ClockSession.user_id == user_id,
            ClockSession.clock_out_at.is_(None),
        )
    )


def _shift_start(shift: Shift, zone: ZoneInfo) -> datetime:
    return datetime.combine(shift.date, shift.start_time, tzinfo=zone)


def _shift_end(shift: Shift, zone: ZoneInfo) -> datetime:
    end = datetime.combine(shift.date, shift.end_time, tzinfo=zone)
    return end + timedelta(days=1) if shift.end_time <= shift.start_time else end


def matching_shift(db: Session, organization_id: UUID, user_id: UUID, now: datetime, location_id: UUID | None = None) -> Shift | None:
    """The assigned shift whose start is closest to now, if it starts within the matching window."""
    rows = db.execute(
        select(Shift, Location)
        .join(Assignment, Assignment.shift_id == Shift.id)
        .join(Location, Location.id == Shift.location_id)
        .where(
            Shift.organization_id == organization_id,
            Assignment.user_id == user_id,
            Shift.date >= (now - timedelta(days=1)).date(),
            Shift.date <= (now + timedelta(days=1)).date(),
        )
    ).all()
    best: tuple[timedelta, Shift] | None = None
    for shift, location in rows:
        if location_id is not None and shift.location_id != location_id:
            continue
        start = _shift_start(shift, _zone(location))
        if not (start - MATCH_BEFORE <= now <= start + MATCH_AFTER):
            continue
        distance = abs(now - start)
        if best is None or distance < best[0]:
            best = (distance, shift)
    return best[1] if best else None


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (haversine)."""
    from math import asin, cos, radians, sin, sqrt

    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6_371_000 * asin(sqrt(a))


def check_geofence(location: Location | None, coords: tuple[float, float, float] | None) -> None:
    """Phone clock-ins must happen near a location that has coordinates set. `coords` is (lat, lon, accuracy_m)."""
    if location is None or location.latitude is None or location.longitude is None:
        return
    if coords is None:
        raise HTTPException(status_code=428, detail="Allow location access to clock in at this location")
    lat, lon, accuracy = coords
    distance = distance_m(lat, lon, location.latitude, location.longitude)
    allowed = (location.clock_radius_m or 150) + min(max(accuracy, 0), 100)
    if distance > allowed:
        raise HTTPException(status_code=403, detail=f"You're {int(distance)} m from {location.name}. Clock in when you're there.")


def clock_in(
    db: Session,
    organization_id: UUID,
    user: User,
    *,
    source: str,
    location_id: UUID | None = None,
    coords: tuple[float, float, float] | None = None,
) -> ClockSession:
    if open_session(db, organization_id, user.id) is not None:
        raise HTTPException(status_code=409, detail="Already clocked in")
    now = datetime.now(UTC)
    shift = matching_shift(db, organization_id, user.id, now, location_id)
    if location_id is None:
        location_id = shift.location_id if shift else db.scalar(
            select(LocationMembership.location_id)
            .join(Location, Location.id == LocationMembership.location_id)
            .where(Location.organization_id == organization_id, LocationMembership.user_id == user.id)
        )
    if source == "phone":
        check_geofence(db.get(Location, location_id) if location_id else None, coords)
    session = ClockSession(
        organization_id=organization_id,
        user_id=user.id,
        location_id=location_id,
        shift_id=shift.id if shift else None,
        source=source,
        clock_in_at=now,
    )
    db.add(session)
    if shift is not None:
        assignment = db.scalar(select(Assignment).where(Assignment.shift_id == shift.id, Assignment.user_id == user.id))
        if assignment is not None:
            assignment.status = AssignmentStatusEnum.IN_SHIFT
            assignment.started_at = now
    db.flush()
    return session


def start_break(db: Session, organization_id: UUID, user: User) -> ClockSession:
    session = open_session(db, organization_id, user.id)
    if session is None:
        raise HTTPException(status_code=409, detail="Not clocked in")
    if session.break_started_at is not None:
        raise HTTPException(status_code=409, detail="Already on a break")
    session.break_started_at = datetime.now(UTC)
    db.flush()
    return session


def end_break(db: Session, organization_id: UUID, user: User) -> ClockSession:
    session = open_session(db, organization_id, user.id)
    if session is None or session.break_started_at is None:
        raise HTTPException(status_code=409, detail="Not on a break")
    session.break_seconds = (session.break_seconds or 0) + int((datetime.now(UTC) - _utc(session.break_started_at)).total_seconds())
    session.break_started_at = None
    db.flush()
    return session


def _minute(value: datetime) -> time:
    return value.replace(second=0, microsecond=0).time()


def clock_out(db: Session, organization_id: UUID, user: User) -> tuple[ClockSession, Timesheet]:
    session = open_session(db, organization_id, user.id)
    if session is None:
        raise HTTPException(status_code=409, detail="Not clocked in")
    if session.break_started_at is not None:
        end_break(db, organization_id, user)
    now = datetime.now(UTC)
    session.clock_out_at = now
    break_minutes = round((session.break_seconds or 0) / 60)
    location = db.get(Location, session.location_id) if session.location_id else None
    zone = _zone(location)
    local_in = _utc(session.clock_in_at).astimezone(zone)
    local_out = now.astimezone(zone)
    shift = db.get(Shift, session.shift_id) if session.shift_id else None

    matches_schedule = False
    if shift is not None:
        start_gap = abs(local_in - _shift_start(shift, zone))
        end_gap = abs(local_out - _shift_end(shift, zone))
        matches_schedule = start_gap <= timedelta(minutes=AUTO_APPROVE_MINUTES) and end_gap <= timedelta(minutes=AUTO_APPROVE_MINUTES)
        assignment = db.scalar(select(Assignment).where(Assignment.shift_id == shift.id, Assignment.user_id == user.id))
        if assignment is not None:
            assignment.status = AssignmentStatusEnum.COMPLETED
            assignment.ended_at = now

    work_date: date = shift.date if shift else local_in.date()
    status = TimesheetStatusEnum.APPROVED if matches_schedule else TimesheetStatusEnum.PENDING
    note = f"Clocked {local_in:%H:%M}–{local_out:%H:%M} ({'tablet' if session.source == 'kiosk' else 'phone'})" + (f", {break_minutes} min break" if break_minutes else "")

    existing = db.scalar(
        select(Timesheet).where(
            Timesheet.organization_id == organization_id,
            Timesheet.user_id == user.id,
            Timesheet.work_date == work_date,
            (Timesheet.shift_id == shift.id) if shift else Timesheet.shift_id.is_(None),
        )
    )
    if existing is not None and existing.status == TimesheetStatusEnum.PENDING:
        timesheet = existing
        timesheet.arrived_at = _minute(local_in)
        timesheet.left_at = _minute(local_out)
        timesheet.note = note
        timesheet.break_minutes = break_minutes
        timesheet.status = status
    elif existing is not None:
        # Already reviewed: keep the reviewed entry, the clock session still records what happened.
        timesheet = existing
    else:
        timesheet = Timesheet(
            organization_id=organization_id,
            user_id=user.id,
            shift_id=shift.id if shift else None,
            work_date=work_date,
            arrived_at=_minute(local_in),
            left_at=_minute(local_out),
            note=note,
            break_minutes=break_minutes,
            is_restricted_entry=shift is None,
            status=status,
        )
        db.add(timesheet)
    if status == TimesheetStatusEnum.APPROVED and timesheet.status == TimesheetStatusEnum.APPROVED and timesheet.reviewed_at is None:
        timesheet.review_note = "Matched the schedule"
        timesheet.reviewed_at = now
    db.flush()
    session.timesheet_id = timesheet.id

    if timesheet.status == TimesheetStatusEnum.PENDING:
        notify_admins_and_managers(
            db,
            organization_id,
            "Hours to approve",
            f"{user.full_name} - {work_date.isoformat()} - {local_in:%H:%M}-{local_out:%H:%M}" + ("" if shift else " - no shift"),
            notification_type=NotificationTypeEnum.TIMESHEET,
            action_url="/schedule/hours",
            actor_id=user.id,
        )
    return session, timesheet


def mode_allows(organization: Organization, source: str) -> bool:
    mode = organization.clock_mode or "both"
    return mode == "both" or mode == source
