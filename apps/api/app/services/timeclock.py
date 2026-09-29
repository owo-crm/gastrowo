"""Clocking in and out, from a worker's phone or a shared tablet with a PIN.

A clock session runs from clock-in to clock-out. Closing it writes the timesheet entry the manager
already reviews today: when both ends are within a few minutes of the scheduled shift the entry is
approved on the spot, otherwise it waits in Hours like any other report.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy import event, select
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


def _fernet() -> Fernet:
    key = hashlib.sha256(f"clock-pin:{settings.secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def read_pin(membership: OrganizationMembership) -> str | None:
    """The member's current PIN in clear text, or None when it was never stored readably."""
    if not membership.clock_pin_encrypted:
        return None
    try:
        return _fernet().decrypt(membership.clock_pin_encrypted.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def _pin_taken(db: Session, membership: OrganizationMembership, digest: str) -> bool:
    query = select(OrganizationMembership.id).where(
        OrganizationMembership.organization_id == membership.organization_id,
        OrganizationMembership.clock_pin_digest == digest,
    )
    if membership.id is not None:
        query = query.where(OrganizationMembership.id != membership.id)
    with db.no_autoflush:
        return db.scalar(query) is not None


def _store_pin(membership: OrganizationMembership, pin: str, digest: str) -> None:
    membership.clock_pin_digest = digest
    membership.clock_pin_encrypted = _fernet().encrypt(pin.encode()).decode()


def set_pin(db: Session, membership: OrganizationMembership, pin: str) -> None:
    pin = validate_pin(pin)
    digest = pin_digest(membership.organization_id, pin)
    if _pin_taken(db, membership, digest):
        raise HTTPException(status_code=409, detail="Someone on the team already uses this PIN. Pick another one.")
    _store_pin(membership, pin, digest)


def generate_pin(db: Session, membership: OrganizationMembership, reserved: set[str] | None = None) -> str:
    """A random PIN nobody else in the business has. `reserved` holds digests handed out in the same flush."""
    reserved = reserved if reserved is not None else set()
    for length, tries in ((4, 50), (6, 50)):
        for _ in range(tries):
            pin = f"{secrets.randbelow(10**length):0{length}d}"
            digest = pin_digest(membership.organization_id, pin)
            if digest in reserved or _pin_taken(db, membership, digest):
                continue
            _store_pin(membership, pin, digest)
            reserved.add(digest)
            return pin
    raise HTTPException(status_code=500, detail="Could not create a PIN")


def ensure_pin(db: Session, membership: OrganizationMembership) -> str:
    """Every member has a readable PIN; older members with only a digest get a new one."""
    pin = read_pin(membership)
    if pin is None:
        pin = generate_pin(db, membership)
    return pin


def install_pin_hooks() -> None:
    """New team members get a PIN automatically, wherever they are created."""
    if event.contains(Session, "before_flush", _assign_pins_before_flush):
        return
    event.listen(Session, "before_flush", _assign_pins_before_flush)


def _assign_pins_before_flush(session: Session, _flush_context, _instances) -> None:
    reserved: set[str] = set()
    for obj in list(session.new):
        if isinstance(obj, OrganizationMembership) and obj.organization_id is not None and not obj.clock_pin_encrypted:
            generate_pin(session, obj, reserved)


def backfill_pins(db: Session) -> int:
    rows = db.scalars(select(OrganizationMembership).where(OrganizationMembership.clock_pin_encrypted.is_(None))).all()
    for membership in rows:
        generate_pin(db, membership)
    db.commit()
    return len(rows)


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


def clock_in(
    db: Session,
    organization_id: UUID,
    user: User,
    *,
    source: str,
    location_id: UUID | None = None,
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
