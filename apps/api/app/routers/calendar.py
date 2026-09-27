from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import Assignment, Location, Organization, OrganizationMembership, Shift

router = APIRouter(prefix="/calendar", tags=["calendar"])

FEED_PURPOSE = "calendar_feed"
FEED_TOKEN_DAYS = 365
FEED_PAST_DAYS = 28
FEED_FUTURE_DAYS = 90


def _feed_key() -> str:
    # A separate key so a leaked feed URL can never be replayed as an API bearer token.
    return f"{settings.secret_key}:{FEED_PURPOSE}"


def create_feed_token(user_id: UUID, organization_id: UUID) -> str:
    payload = {
        "sub": str(user_id),
        "org_id": str(organization_id),
        "purpose": FEED_PURPOSE,
        "exp": datetime.now(UTC) + timedelta(days=FEED_TOKEN_DAYS),
    }
    return jwt.encode(payload, _feed_key(), algorithm=settings.algorithm)


def _decode_feed_token(token: str) -> tuple[UUID, UUID]:
    try:
        payload = jwt.decode(token, _feed_key(), algorithms=[settings.algorithm])
        if payload.get("purpose") != FEED_PURPOSE:
            raise ValueError("wrong purpose")
        return UUID(payload["sub"]), UUID(payload["org_id"])
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Calendar not found") from exc


def _ics_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def _ics_local(value: datetime) -> str:
    return value.strftime("%Y%m%dT%H%M%S")


def _fold(line: str) -> str:
    # RFC 5545: lines longer than 75 octets are folded with CRLF + space.
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    parts: list[str] = []
    current = b""
    for char in line:
        char_bytes = char.encode("utf-8")
        if len(current) + len(char_bytes) > 74:
            parts.append(current.decode("utf-8"))
            current = b""
        current += char_bytes
    parts.append(current.decode("utf-8"))
    return "\r\n ".join(parts)


@router.get("/feed")
def get_calendar_feed(context: OrgContext = Depends(require_org_context())):
    """Personal subscription token for Google Calendar / Apple Calendar / Outlook."""
    token = create_feed_token(context.user.id, context.membership.organization_id)
    return ok({"path": f"/calendar/{token}.ics", "expires_in_days": FEED_TOKEN_DAYS})


@router.get("/{token}.ics")
def calendar_feed_ics(token: str, db: Session = Depends(get_db)):
    user_id, organization_id = _decode_feed_token(token)
    # Removing someone from the business stops their feed even though the URL is still valid.
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    organization = db.get(Organization, organization_id)
    today = date.today()
    rows = db.execute(
        select(Assignment, Shift, Location)
        .join(Shift, Shift.id == Assignment.shift_id)
        .join(Location, Location.id == Shift.location_id)
        .where(
            Assignment.user_id == user_id,
            Shift.organization_id == organization_id,
            Shift.date >= today - timedelta(days=FEED_PAST_DAYS),
            Shift.date <= today + timedelta(days=FEED_FUTURE_DAYS),
        )
        .order_by(Shift.date, Shift.start_time)
    ).all()

    business_name = organization.name if organization else "GastrOWO"
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GastrOWO//Schedule//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_ics_escape(business_name)} - GastrOWO",
        "X-PUBLISHED-TTL:PT1H",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ]
    for assignment, shift, location in rows:
        start = datetime.combine(shift.date, shift.start_time)
        end = datetime.combine(shift.date, shift.end_time)
        if end <= start:
            end += timedelta(days=1)
        role = shift.staff_position or shift.required_role.value.title()
        tz = location.timezone or "Europe/Warsaw"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{assignment.id}@gastrowo",
            f"DTSTAMP:{stamp}",
            f"DTSTART;TZID={tz}:{_ics_local(start)}",
            f"DTEND;TZID={tz}:{_ics_local(end)}",
            f"SUMMARY:{_ics_escape(f'{role} - {location.name}')}",
            f"LOCATION:{_ics_escape(location.name)}",
            f"DESCRIPTION:{_ics_escape(f'{business_name} shift')}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")

    return Response(
        content="\r\n".join(_fold(line) for line in lines) + "\r\n",
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=900"},
    )
