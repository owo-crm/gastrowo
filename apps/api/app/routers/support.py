from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import Organization, SupportMessage, SupportThread, User
from app.routers.platform import require_platform_admin
from app.services import support
from app.services.auth_email import send_notice_email, support_email_html

router = APIRouter(tags=["support"])


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class StatusIn(BaseModel):
    status: Literal["open", "closed"]


def _send_emails(emails: list[tuple[str, str, str]], link: str, button: str) -> None:
    for to, subject, body in emails:
        send_notice_email(
            email=to,
            subject=subject,
            text=f"{body}\n\nReply in Platofy: {link}",
            html=support_email_html(heading=subject, preview=support.preview(body, 600), link=link, button=button),
        )


def _clean(body: str) -> str:
    text = body.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write a message first")
    return text


def _frontend(path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}"


# ---- Customers -------------------------------------------------------------------------------


def _customer_payload(db: Session, thread: SupportThread | None) -> dict:
    if thread is None:
        return {"thread": None, "messages": [], "unread": 0}
    return {
        "thread": {"id": str(thread.id), "status": thread.status},
        "messages": support.messages_out(db, thread),
        "unread": support.unread_count(db, thread, for_staff=False),
    }


@router.get("/support")
def my_thread(read: bool = False, context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    thread = support.thread_for(db, context.membership.organization_id, context.user.id)
    if thread is not None and read:
        thread.customer_read_at = datetime.now(UTC)
        db.commit()
    return ok(_customer_payload(db, thread))


@router.get("/support/unread")
def my_unread(context: OrgContext = Depends(require_org_context()), db: Session = Depends(get_db)):
    thread = support.thread_for(db, context.membership.organization_id, context.user.id)
    return ok({"unread": support.unread_count(db, thread, for_staff=False) if thread else 0})


@router.post("/support/messages")
def write_to_support(
    payload: MessageIn,
    background: BackgroundTasks,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    body = _clean(payload.body)
    organization = db.get(Organization, context.membership.organization_id)
    thread = support.thread_for(db, context.membership.organization_id, context.user.id)
    if thread is None:
        thread = SupportThread(organization_id=context.membership.organization_id, user_id=context.user.id)
        db.add(thread)
        db.flush()
    elif support.too_many(db, thread, from_staff=False):
        raise HTTPException(status_code=429, detail="That's a lot of messages. Give us a moment to catch up.")
    support.add_message(db, thread, context.user, body, from_staff=False)
    emails = support.notify_staff(db, thread, context.user, support.display_name(organization), body)
    db.commit()
    background.add_task(_send_emails, emails, _frontend(f"/platform/support?thread={thread.id}"), "Open the conversation")
    return ok(_customer_payload(db, thread))


# ---- Platofy team ----------------------------------------------------------------------------


def _thread_row(db: Session, thread: SupportThread, organization: Organization | None, user: User | None) -> dict:
    last = db.scalar(select(SupportMessage).where(SupportMessage.thread_id == thread.id).order_by(SupportMessage.created_at.desc()).limit(1))
    return {
        "id": str(thread.id),
        "status": thread.status,
        "organization_id": str(thread.organization_id),
        "organization_name": support.display_name(organization),
        "user_name": user.full_name if user else "—",
        "user_email": user.email if user else None,
        "last_message_at": support._utc(thread.last_message_at).isoformat(),
        "last_message": support.preview(last.body, 90) if last else "",
        "last_from_staff": bool(last and last.from_staff),
        "unread": support.unread_count(db, thread, for_staff=True),
    }


def _thread_or_404(db: Session, thread_id: UUID) -> SupportThread:
    thread = db.get(SupportThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return thread


@router.get("/platform/support/threads")
def list_threads(status: Literal["open", "closed", "all"] = "open", _: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    query = select(SupportThread, Organization, User).join(Organization, Organization.id == SupportThread.organization_id).outerjoin(User, User.id == SupportThread.user_id)
    if status != "all":
        query = query.where(SupportThread.status == status)
    rows = db.execute(query.order_by(SupportThread.last_message_at.desc()).limit(200)).all()
    return ok([_thread_row(db, thread, organization, user) for thread, organization, user in rows])


@router.get("/platform/support/unread")
def staff_unread(_: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    threads = db.scalars(select(SupportThread).where(SupportThread.status == "open")).all()
    return ok({"threads": sum(1 for thread in threads if support.unread_count(db, thread, for_staff=True))})


def _staff_payload(db: Session, thread: SupportThread) -> dict:
    organization = db.get(Organization, thread.organization_id)
    user = db.get(User, thread.user_id)
    return {**_thread_row(db, thread, organization, user), "messages": support.messages_out(db, thread)}


@router.get("/platform/support/threads/{thread_id}")
def open_thread(thread_id: UUID, _: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    thread = _thread_or_404(db, thread_id)
    thread.staff_read_at = datetime.now(UTC)
    db.commit()
    return ok(_staff_payload(db, thread))


@router.post("/platform/support/threads/{thread_id}/messages")
def reply(thread_id: UUID, payload: MessageIn, background: BackgroundTasks, actor: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    thread = _thread_or_404(db, thread_id)
    body = _clean(payload.body)
    support.add_message(db, thread, actor, body, from_staff=True)
    emails = support.notify_customer(db, thread, body)
    db.commit()
    background.add_task(_send_emails, emails, _frontend("/settings?support=1"), "Open the chat")
    return ok(_staff_payload(db, thread))


@router.patch("/platform/support/threads/{thread_id}")
def set_status(thread_id: UUID, payload: StatusIn, _: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    thread = _thread_or_404(db, thread_id)
    thread.status = payload.status
    db.commit()
    return ok(_staff_payload(db, thread))
