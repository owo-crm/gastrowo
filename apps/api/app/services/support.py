"""In-app support chat between a customer (one person in one business) and the Platofy team.

Each new message tells the other side right away: a bell notification (which also sends a web push)
and, when they have not looked at the thread since the last email, one email.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import OrganizationMembership, SupportMessage, SupportThread, User
from app.services.notifications import notify_users

STAFF_NAME = "Platofy team"
MAX_MESSAGES_PER_WINDOW = 30
RATE_WINDOW = timedelta(minutes=10)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def display_name(organization) -> str:
    if organization is None:
        return "—"
    from app.services.demo_restaurant import display_name as clean_name

    return clean_name(organization)


def preview(body: str, limit: int = 140) -> str:
    text = " ".join(body.split())
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


def message_out(message: SupportMessage, author_name: str | None) -> dict:
    return {
        "id": str(message.id),
        "body": message.body,
        "from_staff": message.from_staff,
        "author_name": STAFF_NAME if message.from_staff else author_name,
        "created_at": _utc(message.created_at).isoformat(),
    }


def messages_out(db: Session, thread: SupportThread) -> list[dict]:
    rows = db.execute(
        select(SupportMessage, User.full_name)
        .outerjoin(User, User.id == SupportMessage.author_id)
        .where(SupportMessage.thread_id == thread.id)
        .order_by(SupportMessage.created_at, SupportMessage.id)
    ).all()
    return [message_out(message, name) for message, name in rows]


def unread_count(db: Session, thread: SupportThread, *, for_staff: bool) -> int:
    seen = _utc(thread.staff_read_at if for_staff else thread.customer_read_at)
    query = select(func.count()).select_from(SupportMessage).where(
        SupportMessage.thread_id == thread.id,
        SupportMessage.from_staff.is_(not for_staff),
    )
    if seen is not None:
        query = query.where(SupportMessage.created_at > seen)
    return db.scalar(query) or 0


def thread_for(db: Session, organization_id: UUID, user_id: UUID) -> SupportThread | None:
    return db.scalar(select(SupportThread).where(SupportThread.organization_id == organization_id, SupportThread.user_id == user_id))


def too_many(db: Session, thread: SupportThread, *, from_staff: bool) -> bool:
    since = datetime.now(UTC) - RATE_WINDOW
    count = db.scalar(
        select(func.count()).select_from(SupportMessage).where(
            SupportMessage.thread_id == thread.id, SupportMessage.from_staff.is_(from_staff), SupportMessage.created_at >= since
        )
    )
    return (count or 0) >= MAX_MESSAGES_PER_WINDOW


def add_message(db: Session, thread: SupportThread, author: User, body: str, *, from_staff: bool) -> SupportMessage:
    now = datetime.now(UTC)
    message = SupportMessage(thread_id=thread.id, author_id=author.id, from_staff=from_staff, body=body, created_at=now)
    db.add(message)
    thread.last_message_at = now
    thread.status = "open"
    # Writing a message means you have seen everything before it.
    if from_staff:
        thread.staff_read_at = now
    else:
        thread.customer_read_at = now
    return message


def platform_admins(db: Session) -> list[User]:
    emails = settings.parsed_platform_admin_emails
    if not emails:
        return []
    return list(db.scalars(select(User).where(func.lower(User.email).in_(emails))).all())


def _needs_email(emailed_at: datetime | None, read_at: datetime | None) -> bool:
    """One email per unread spell: again only after they have opened the thread since the last one."""
    emailed_at, read_at = _utc(emailed_at), _utc(read_at)
    return emailed_at is None or (read_at is not None and read_at >= emailed_at)


def notify_staff(db: Session, thread: SupportThread, customer: User, business_name: str, body: str) -> list[tuple[str, str, str]]:
    """Bell + push for every platform admin; returns the emails to send (to, subject, text)."""
    link = f"/platform/support?thread={thread.id}"
    for admin in platform_admins(db):
        home = db.scalar(select(OrganizationMembership.organization_id).where(OrganizationMembership.user_id == admin.id).limit(1))
        if home is not None:
            notify_users(db, home, [admin.id], f"Support: {customer.full_name} ({business_name})", preview(body), action_url=link, entity_kind="support_thread", entity_id=str(thread.id))
    emails: list[tuple[str, str, str]] = []
    if _needs_email(thread.staff_emailed_at, thread.staff_read_at):
        thread.staff_emailed_at = datetime.now(UTC)
        for admin in platform_admins(db):
            emails.append((admin.email, f"New support message from {customer.full_name} ({business_name})", body))
    return emails


def notify_customer(db: Session, thread: SupportThread, body: str) -> list[tuple[str, str, str]]:
    customer = db.get(User, thread.user_id)
    if customer is None:
        return []
    notify_users(db, thread.organization_id, [customer.id], "Reply from the Platofy team", preview(body), action_url="/settings?support=1", entity_kind="support_thread", entity_id=str(thread.id))
    if _needs_email(thread.customer_emailed_at, thread.customer_read_at):
        thread.customer_emailed_at = datetime.now(UTC)
        return [(customer.email, "The Platofy team replied to your message", body)]
    return []
