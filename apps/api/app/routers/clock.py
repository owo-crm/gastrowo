"""Time clock: phone clock-in, personal PINs, shared tablets (kiosks) and the business's clock mode."""

from __future__ import annotations

import hashlib
import secrets
import time as monotonic_time
from collections import defaultdict, deque
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_business_settings, can_manage_team
from app.db import get_db
from app.models import ClockSession, KioskDevice, Location, LocationMembership, Organization, OrganizationMembership, RoleEnum, Shift, User
from app.services.timeclock import (
    _utc,
    CLOCK_MODES,
    clock_in,
    clock_out,
    end_break,
    ensure_pin,
    generate_pin,
    membership_for_pin,
    mode_allows,
    next_shift,
    open_session,
    read_pin,
    set_pin,
    start_break,
    todays_shift,
)

router = APIRouter(tags=["clock"])


class PinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=6)


class PunchIn(PinIn):
    # "in"/"out" come from the tablet's own screen and never flip a shift the other way on a double tap.
    action: Literal["toggle", "in", "out", "break"] = "toggle"


class ClockModeIn(BaseModel):
    mode: Literal["phone", "kiosk", "both"]


class KioskCreateIn(BaseModel):
    location_id: UUID
    name: str = Field(default="Time clock", min_length=1, max_length=80)


def _session_out(db: Session, session: ClockSession | None) -> dict | None:
    if session is None:
        return None
    location = db.get(Location, session.location_id) if session.location_id else None
    shift = db.get(Shift, session.shift_id) if session.shift_id else None
    return {
        "id": str(session.id),
        "clock_in_at": session.clock_in_at.isoformat(),
        "clock_out_at": session.clock_out_at.isoformat() if session.clock_out_at else None,
        "source": session.source,
        "on_break": session.break_started_at is not None,
        "break_started_at": session.break_started_at.isoformat() if session.break_started_at else None,
        "break_seconds": session.break_seconds or 0,
        "location_name": location.name if location else None,
        "shift": {
            "id": str(shift.id),
            "date": shift.date.isoformat(),
            "start_time": shift.start_time.isoformat(timespec="minutes"),
            "end_time": shift.end_time.isoformat(timespec="minutes"),
            "staff_position": shift.staff_position,
        }
        if shift
        else None,
    }


# ---- The worker's own clock (phone) ----


@router.get("/clock/me")
def my_clock(context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    organization = get_current_organization(context, db)
    pin = ensure_pin(db, context.membership)
    db.commit()
    return ok(
        {
            "mode": organization.clock_mode or "both",
            "phone_allowed": mode_allows(organization, "phone"),
            "has_pin": True,
            "pin": pin,
            "open_session": _session_out(db, open_session(db, organization.id, context.user.id)),
            "next_shift": _next_shift_out(db, organization.id, context.user.id),
        }
    )


def _next_shift_out(db: Session, organization_id: UUID, user_id: UUID) -> dict | None:
    """The shift running now or coming next, for the "Next shift" card on the worker's home."""
    found = next_shift(db, organization_id, user_id)
    if found is None:
        return None
    shift, location = found
    return {
        "shift_id": str(shift.id),
        "date": shift.date.isoformat(),
        "start_time": shift.start_time.isoformat(timespec="minutes"),
        "end_time": shift.end_time.isoformat(timespec="minutes"),
        "staff_position": shift.staff_position,
        "location_name": location.name,
    }


@router.post("/clock/in")
def phone_clock_in(context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    organization = get_current_organization(context, db)
    if not mode_allows(organization, "phone"):
        raise HTTPException(status_code=403, detail="Your business clocks in on the tablet at work")
    session = clock_in(db, organization.id, context.user, source="phone")
    db.commit()
    return ok(_session_out(db, session))


@router.post("/clock/break/start")
def phone_break_start(context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    session = start_break(db, context.membership.organization_id, context.user)
    db.commit()
    return ok(_session_out(db, session))


@router.post("/clock/break/end")
def phone_break_end(context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    session = end_break(db, context.membership.organization_id, context.user)
    db.commit()
    return ok(_session_out(db, session))


@router.post("/clock/out")
def phone_clock_out(context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    organization = get_current_organization(context, db)
    session, timesheet = clock_out(db, organization.id, context.user)
    db.commit()
    return ok({"session": _session_out(db, session), "timesheet_status": timesheet.status.value})


@router.put("/clock/pin")
def set_my_pin(payload: PinIn, context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    set_pin(db, context.membership, payload.pin)
    db.commit()
    return ok({"has_pin": True, "pin": read_pin(context.membership)})


# ---- Manager tools ----


def _require_team(context: OrgContext, db: Session) -> Organization:
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")
    return organization


def _require_settings(context: OrgContext, db: Session) -> Organization:
    organization = get_current_organization(context, db)
    if not can_manage_business_settings(context.membership, organization):
        raise HTTPException(status_code=403, detail="Business settings access is disabled for this account")
    return organization


@router.post("/clock/pins/{user_id}")
def reset_pin(
    user_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    """Give someone a new random PIN."""
    membership = _team_member(context, db, user_id)
    pin = generate_pin(db, membership)
    db.commit()
    return ok({"pin": pin})


@router.put("/clock/pins/{user_id}")
def set_member_pin(
    user_id: UUID,
    payload: PinIn,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    """Set a PIN the manager chose for this person."""
    membership = _team_member(context, db, user_id)
    set_pin(db, membership, payload.pin)
    db.commit()
    return ok({"pin": read_pin(membership)})


def _team_member(context: OrgContext, db: Session, user_id: UUID) -> OrganizationMembership:
    organization = _require_team(context, db)
    membership = db.scalar(
        select(OrganizationMembership).where(OrganizationMembership.organization_id == organization.id, OrganizationMembership.user_id == user_id)
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return membership


@router.get("/clock/team")
def team_on_the_clock(
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(ClockSession, User)
        .join(User, User.id == ClockSession.user_id)
        .where(ClockSession.organization_id == context.membership.organization_id, ClockSession.clock_out_at.is_(None))
        .order_by(ClockSession.clock_in_at)
    ).all()
    return ok([{**(_session_out(db, session) or {}), "user_id": str(user.id), "full_name": user.full_name} for session, user in rows])


@router.patch("/clock/settings")
def set_clock_mode(
    payload: ClockModeIn,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = _require_settings(context, db)
    if payload.mode not in CLOCK_MODES:
        raise HTTPException(status_code=422, detail="Unknown clock mode")
    organization.clock_mode = payload.mode
    db.commit()
    return ok({"mode": organization.clock_mode})


@router.get("/clock/kiosks")
def list_kiosks(
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(KioskDevice, Location)
        .join(Location, Location.id == KioskDevice.location_id)
        .where(KioskDevice.organization_id == context.membership.organization_id)
        .order_by(KioskDevice.created_at)
    ).all()
    return ok(
        [
            {
                "id": str(device.id),
                "name": device.name,
                "location_id": str(location.id),
                "location_name": location.name,
                "created_at": device.created_at.isoformat(),
                "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
            }
            for device, location in rows
        ]
    )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/clock/kiosks")
def create_kiosk(
    payload: KioskCreateIn,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    """Turn a device into a time clock for one location. The token is returned once and kept on the device."""
    organization = _require_settings(context, db)
    location = db.get(Location, payload.location_id)
    if location is None or location.organization_id != organization.id:
        raise HTTPException(status_code=404, detail="Location not found")
    token = secrets.token_urlsafe(32)
    device = KioskDevice(
        organization_id=organization.id,
        location_id=location.id,
        name=payload.name.strip(),
        token_hash=_hash_token(token),
        created_by=context.user.id,
    )
    db.add(device)
    db.commit()
    return ok({"id": str(device.id), "token": token, "location_name": location.name})


class KioskRenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@router.patch("/clock/kiosks/{device_id}")
def rename_kiosk(
    device_id: UUID,
    payload: KioskRenameIn,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = _require_settings(context, db)
    device = db.get(KioskDevice, device_id)
    if device is None or device.organization_id != organization.id:
        raise HTTPException(status_code=404, detail="Time clock not found")
    device.name = payload.name.strip()
    db.commit()
    return ok({"id": str(device.id), "name": device.name})


@router.delete("/clock/kiosks/{device_id}")
def delete_kiosk(
    device_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = _require_settings(context, db)
    device = db.get(KioskDevice, device_id)
    if device is None or device.organization_id != organization.id:
        raise HTTPException(status_code=404, detail="Time clock not found")
    db.delete(device)
    db.commit()
    return ok({"deleted": True})


# ---- The tablet itself: authenticated by its device token, not by a person ----

_WRONG_PIN_WINDOW_SECONDS = 300
_WRONG_PIN_LIMIT = 8
_wrong_pins: dict[UUID, deque[float]] = defaultdict(deque)


def _kiosk(db: Session, token: str | None) -> tuple[KioskDevice, Organization, Location]:
    if not token:
        raise HTTPException(status_code=401, detail="This device is not set up as a time clock")
    device = db.scalar(select(KioskDevice).where(KioskDevice.token_hash == _hash_token(token)))
    if device is None:
        raise HTTPException(status_code=401, detail="This time clock was removed. Set it up again from Settings.")
    organization = db.get(Organization, device.organization_id)
    location = db.get(Location, device.location_id)
    if organization is None or location is None:
        raise HTTPException(status_code=401, detail="This time clock was removed. Set it up again from Settings.")
    device.last_seen_at = datetime.now(UTC)
    return device, organization, location


@router.get("/kiosk/device")
def kiosk_device(x_kiosk_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    device, organization, location = _kiosk(db, x_kiosk_token)
    db.commit()
    return ok(
        {
            "id": str(device.id),
            "name": device.name,
            "business_name": organization.name,
            "location_name": location.name,
            "timezone": location.timezone,
            "enabled": mode_allows(organization, "kiosk"),
        }
    )


def _check_wrong_pin_limit(device: KioskDevice) -> tuple[deque[float], float]:
    attempts = _wrong_pins[device.id]
    now = monotonic_time.monotonic()
    while attempts and now - attempts[0] > _WRONG_PIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= _WRONG_PIN_LIMIT:
        raise HTTPException(status_code=429, detail="Too many wrong PINs. Wait a few minutes.")
    return attempts, now


@router.post("/kiosk/exit")
def kiosk_exit(payload: PinIn, x_kiosk_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Leave the time clock screen. Only the owner's or a manager's own PIN opens it."""
    device, organization, _location = _kiosk(db, x_kiosk_token)
    attempts, now = _check_wrong_pin_limit(device)
    membership = membership_for_pin(db, organization.id, payload.pin) if payload.pin.strip().isdigit() else None
    if membership is None or membership.role not in (RoleEnum.ADMIN, RoleEnum.MANAGER):
        attempts.append(now)
        db.commit()
        raise HTTPException(status_code=403, detail="Only a manager's PIN can close the time clock")
    db.commit()
    return ok({"ok": True})


def _kiosk_person(db: Session, organization: Organization, pin: str, attempts: deque[float], now: float) -> User:
    membership = membership_for_pin(db, organization.id, pin) if pin.strip().isdigit() else None
    if membership is None:
        attempts.append(now)
        db.commit()
        raise HTTPException(status_code=404, detail="Unknown PIN")
    user = db.get(User, membership.user_id)
    assert user is not None
    return user


@router.post("/kiosk/lookup")
def kiosk_lookup(payload: PinIn, x_kiosk_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Who owns this PIN and where their shift stands. Changes nothing; the tablet shows it before any punch."""
    device, organization, location = _kiosk(db, x_kiosk_token)
    if not mode_allows(organization, "kiosk"):
        raise HTTPException(status_code=403, detail="The tablet clock is turned off for this business")
    attempts, now = _check_wrong_pin_limit(device)
    user = _kiosk_person(db, organization, payload.pin, attempts, now)
    current = open_session(db, organization.id, user.id)
    shift = db.get(Shift, current.shift_id) if current and current.shift_id else todays_shift(db, organization.id, user.id, location)
    db.commit()
    return ok(
        {
            "full_name": user.full_name,
            "open_session": _session_out(db, current),
            "shift": {
                "start_time": shift.start_time.isoformat(timespec="minutes"),
                "end_time": shift.end_time.isoformat(timespec="minutes"),
                "staff_position": shift.staff_position,
            }
            if shift
            else None,
            "server_now": datetime.now(UTC).isoformat(),
        }
    )


@router.post("/kiosk/punch")
def kiosk_punch(payload: PunchIn, x_kiosk_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Clock the owner of this PIN in, or out if they are already in."""
    device, organization, location = _kiosk(db, x_kiosk_token)
    if not mode_allows(organization, "kiosk"):
        raise HTTPException(status_code=403, detail="The tablet clock is turned off for this business")

    attempts, now = _check_wrong_pin_limit(device)

    user = _kiosk_person(db, organization, payload.pin, attempts, now)

    current = open_session(db, organization.id, user.id)
    if payload.action == "in" and current is not None:
        raise HTTPException(status_code=409, detail="Already clocked in")
    if payload.action == "out" and current is None:
        raise HTTPException(status_code=409, detail="Not clocked in")
    if payload.action == "break":
        if current is None:
            raise HTTPException(status_code=409, detail="Clock in first")
        if current.break_started_at is None:
            session = start_break(db, organization.id, user)
            db.commit()
            return ok({"action": "break_start", "full_name": user.full_name, "session": _session_out(db, session)})
        session = end_break(db, organization.id, user)
        db.commit()
        return ok({"action": "break_end", "full_name": user.full_name, "session": _session_out(db, session)})
    if current is None:
        session = clock_in(db, organization.id, user, source="kiosk", location_id=location.id)
        db.commit()
        return ok({"action": "in", "full_name": user.full_name, "session": _session_out(db, session)})
    session, timesheet = clock_out(db, organization.id, user)
    db.commit()
    worked = (_utc(session.clock_out_at) - _utc(session.clock_in_at)).total_seconds() / 3600 if session.clock_out_at else 0
    return ok(
        {
            "action": "out",
            "full_name": user.full_name,
            "hours": round(worked, 2),
            "timesheet_status": timesheet.status.value,
            "session": _session_out(db, session),
        }
    )
