"""Public lead capture for the free tools, comparison pages and the free switch-over offer."""

from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.envelope import ok
from app.db import get_db
from app.models import MarketingLead, OrganizationMembership, User
from app.routers.platform import require_platform_admin
from app.services.auth_email import send_notice_email, support_email_html
from app.services.notifications import notify_users
from app.services.support import platform_admins

router = APIRouter(tags=["marketing"])

_recent: dict[str, list[float]] = {}
PER_IP_PER_HOUR = 10


class LeadIn(BaseModel):
    email: EmailStr
    kind: Literal["template", "calculator", "migration", "compare"]
    source: str | None = Field(default=None, max_length=120)
    name: str | None = Field(default=None, max_length=120)
    business: str | None = Field(default=None, max_length=160)
    current_tool: str | None = Field(default=None, max_length=80)
    team_size: str | None = Field(default=None, max_length=40)
    message: str | None = Field(default=None, max_length=4000)
    # Left empty by people; bots fill every field.
    website: str | None = Field(default=None, max_length=200)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def _check_rate(ip: str) -> None:
    now = time.monotonic()
    recent = [moment for moment in _recent.get(ip, []) if now - moment < 3600]
    if len(recent) >= PER_IP_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many requests from this network. Try again later.")
    recent.append(now)
    _recent[ip] = recent


def _site(path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}"


def _welcome(lead: MarketingLead) -> tuple[str, str, str, str] | None:
    """(subject, heading, body, link) for the email the visitor asked for."""
    if lead.kind == "template":
        return (
            "Your free restaurant schedule template",
            "Here's your schedule template",
            "Excel: " + _site("/tools/restaurant-schedule-template.xlsx") + "\nCSV (Google Sheets): " + _site("/tools/restaurant-schedule-template.csv")
            + "\n\nWhen rebuilding it every week gets old, Platofy builds the week from your team's availability, sends it to every phone and clocks people in. Free for one location and up to 15 people.",
            _site("/login?mode=onboarding&utm_source=template_email"),
        )
    if lead.kind == "migration":
        return (
            "We'll move your schedule to Platofy",
            "Thanks, we're on it",
            "Reply to this email with your export (CSV or Excel from your current tool) or just a photo of this week's schedule. "
            "We'll set up your team, positions and shift templates and send you a link when it's ready. Usually within one business day.",
            _site("/login?mode=onboarding&utm_source=switch_email"),
        )
    return None


def _send(lead_email: str, welcome: tuple[str, str, str, str] | None, team: list[tuple[str, str]]) -> None:
    if welcome:
        subject, heading, body, link = welcome
        send_notice_email(email=lead_email, subject=subject, text=f"{body}\n\n{link}", html=support_email_html(heading=heading, preview=body, link=link, button="Try Platofy free"))
    for email, text in team:
        send_notice_email(email=email, subject="New switch-over request", text=text, html=support_email_html(heading="New switch-over request", preview=text, link=_site("/platform"), button="Open Platform"))


@router.post("/marketing/leads")
def create_lead(payload: LeadIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    if payload.website:
        return ok({"received": True})  # a bot: pretend it worked
    _check_rate(_client_ip(request))
    lead = MarketingLead(
        email=str(payload.email).lower(),
        kind=payload.kind,
        source=payload.source,
        name=(payload.name or "").strip() or None,
        business=(payload.business or "").strip() or None,
        current_tool=payload.current_tool,
        team_size=payload.team_size,
        message=(payload.message or "").strip() or None,
    )
    db.add(lead)
    team: list[tuple[str, str]] = []
    if lead.kind == "migration":
        # A switch-over request is a warm lead: tell the team right away (bell, push and email).
        summary = f"{lead.name or lead.email} · {lead.business or 'restaurant'} · from {lead.current_tool or 'unknown tool'}"
        details = "\n".join(filter(None, [summary, f"Email: {lead.email}", f"Team: {lead.team_size}" if lead.team_size else None, lead.message]))
        for admin in platform_admins(db):
            home = db.scalar(select(OrganizationMembership.organization_id).where(OrganizationMembership.user_id == admin.id).limit(1))
            if home is not None:
                notify_users(db, home, [admin.id], "New switch-over request", summary, action_url="/platform")
            team.append((admin.email, details))
    db.commit()
    background.add_task(_send, lead.email, _welcome(lead), team)
    return ok({"received": True})


@router.get("/platform/leads")
def list_leads(_: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(MarketingLead).order_by(desc(MarketingLead.created_at)).limit(300)).all()
    return ok(
        [
            {
                "id": str(item.id),
                "email": item.email,
                "kind": item.kind,
                "source": item.source,
                "name": item.name,
                "business": item.business,
                "current_tool": item.current_tool,
                "team_size": item.team_size,
                "message": item.message,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in rows
        ]
    )
