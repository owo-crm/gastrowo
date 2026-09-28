"""Register a phone or browser for push notifications."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.envelope import ok
from app.db import get_db
from app.models import PushSubscription, User
from app.services.push import vapid_keys

router = APIRouter(prefix="/push", tags=["push"])


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=10, max_length=255)
    auth: str = Field(min_length=4, max_length=255)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)
    keys: SubscriptionKeys


class UnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)


@router.get("/key")
def public_key(db: Session = Depends(get_db)):
    return ok({"public_key": vapid_keys(db)[1]})


@router.post("/subscribe")
def subscribe(
    payload: SubscriptionIn,
    user: User = Depends(get_current_user),
    user_agent: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    # One row per device; re-subscribing (or a new person on the same device) takes the row over.
    existing = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if existing is None:
        existing = PushSubscription(endpoint=payload.endpoint, user_id=user.id, p256dh=payload.keys.p256dh, auth=payload.keys.auth)
        db.add(existing)
    existing.user_id = user.id
    existing.p256dh = payload.keys.p256dh
    existing.auth = payload.keys.auth
    existing.user_agent = (user_agent or "")[:255] or None
    db.commit()
    return ok({"subscribed": True})


@router.post("/unsubscribe")
def unsubscribe(payload: UnsubscribeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(PushSubscription).where(PushSubscription.endpoint == payload.endpoint, PushSubscription.user_id == user.id))
    db.commit()
    return ok({"subscribed": False})
