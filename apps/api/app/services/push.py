"""Web push: every in-app notification is also pushed to the person's phones and browsers.

The VAPID key pair comes from VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY when set; otherwise it is generated
once and kept in the database, so pushes keep working across redeploys with nothing to configure.
Sending happens after the transaction commits, on a small thread pool, so requests never wait on it.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session

from app.models import AppSecret, InAppNotification, PushSubscription

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="push")
_PENDING_KEY = "pending_push"
_keys_cache: tuple[str, str] | None = None


@dataclass(frozen=True)
class PendingPush:
    user_id: UUID
    title: str
    body: str
    url: str | None


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def vapid_keys(db: Session) -> tuple[str, str]:
    """(private PEM, public key as base64url) — the public half is what browsers subscribe with."""
    global _keys_cache
    if _keys_cache:
        return _keys_cache
    env_private, env_public = os.getenv("VAPID_PRIVATE_KEY"), os.getenv("VAPID_PUBLIC_KEY")
    if env_private and env_public:
        _keys_cache = (env_private.replace("\\n", "\n"), env_public)
        return _keys_cache
    stored = db.get(AppSecret, "vapid")
    if stored is None:
        from cryptography.hazmat.primitives import serialization
        from py_vapid import Vapid

        vapid = Vapid()
        vapid.generate_keys()
        private_pem = vapid.private_pem().decode()
        public = _b64url(vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
        stored = AppSecret(key="vapid", value=json.dumps({"private": private_pem, "public": public}))
        db.add(stored)
        db.commit()
    data = json.loads(stored.value)
    _keys_cache = (data["private"], data["public"])
    return _keys_cache


def _session_factory():
    from app.db import SessionLocal

    return SessionLocal()


def _submit(items: list[PendingPush]) -> None:
    _executor.submit(_deliver, items)


def _deliver(items: list[PendingPush]) -> None:

    try:
        from py_vapid import Vapid
        from pywebpush import WebPushException, webpush
    except ImportError:  # pragma: no cover - dependency missing
        return
    from app.core.config import settings

    db = _session_factory()
    try:
        user_ids = {item.user_id for item in items}
        subscriptions = db.scalars(select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))).all()
        if not subscriptions:
            return
        private_pem, _ = vapid_keys(db)
        vapid = Vapid.from_pem(private_pem.encode())
        contact = f"mailto:{settings.push_contact_email}"
        gone: list[UUID] = []
        by_user: dict[UUID, list[PushSubscription]] = {}
        for subscription in subscriptions:
            by_user.setdefault(subscription.user_id, []).append(subscription)
        for item in items:
            payload = json.dumps({"title": item.title, "body": item.body, "url": item.url or "/"})
            for subscription in by_user.get(item.user_id, []):
                try:
                    webpush(
                        subscription_info={"endpoint": subscription.endpoint, "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}},
                        data=payload,
                        vapid_private_key=vapid,
                        vapid_claims={"sub": contact},
                        ttl=24 * 3600,
                        timeout=10,
                    )
                except WebPushException as exc:
                    status = getattr(exc.response, "status_code", None)
                    if status in (404, 410):
                        gone.append(subscription.id)
                    else:
                        logger.warning("Push failed (%s): %s", status, exc)
                except Exception:
                    logger.exception("Push failed")
        if gone:
            db.execute(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
            db.commit()
    finally:
        db.close()


def _collect(session: Session, _flush_context) -> None:
    pending = session.info.setdefault(_PENDING_KEY, [])
    for obj in session.new:
        if isinstance(obj, InAppNotification):
            pending.append(PendingPush(user_id=obj.user_id, title=obj.title, body=obj.body, url=obj.action_url))


def _send_after_commit(session: Session) -> None:
    pending = session.info.pop(_PENDING_KEY, None)
    if pending and not os.getenv("PUSH_DISABLED"):
        _submit(list(pending))


def _drop_after_rollback(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)


def install_push_hooks() -> None:
    event.listen(Session, "after_flush", _collect)
    event.listen(Session, "after_commit", _send_after_commit)
    event.listen(Session, "after_soft_rollback", lambda session, _previous: _drop_after_rollback(session))
