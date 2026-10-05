"""Email the Platofy team (PLATFORM_ADMIN_EMAILS) whenever a new business signs up."""

from __future__ import annotations

from fastapi import BackgroundTasks

from app.core.config import settings
from app.models import Organization, User
from app.services.auth_email import send_notice_email, support_email_html


def _details(org: Organization, owner: User, referred_by: str | None) -> str:
    rows = [
        ("Business", org.name),
        ("Owner", f"{owner.full_name} <{owner.email}>"),
        ("Country", org.country),
        ("Type", org.signup_business_type),
        ("Team size", org.signup_team_size),
        ("Using before", org.signup_previous_tool),
        ("Heard about us", owner.onboarding_source),
        ("Referred by", referred_by),
    ]
    return "\n".join(f"{label}: {value}" for label, value in rows if value)


def notify_new_business(background: BackgroundTasks, org: Organization, owner: User, referred_by: str | None = None) -> None:
    """Queue one email per team address; sent after the response, best effort."""
    emails = settings.parsed_platform_admin_emails
    if not emails:
        return
    text = _details(org, owner, referred_by)
    subject = f"New restaurant on Platofy: {org.name}"
    link = f"{settings.frontend_url.rstrip('/')}/platform"
    html = support_email_html(heading="A new restaurant signed up", preview=text, link=link, button="Open Platform")
    for email in emails:
        background.add_task(send_notice_email, email=email, subject=subject, text=f"{text}\n\n{link}", html=html)
