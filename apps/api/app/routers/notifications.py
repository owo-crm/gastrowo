from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import InAppNotification

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _serialize_notification(item: InAppNotification) -> dict:
    return {
        "id": str(item.id),
        "title": item.title,
        "body": item.body,
        "read_at": item.read_at,
        "created_at": item.created_at,
    }


@router.get("")
def list_notifications(
    limit: int = 20,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    bounded_limit = min(max(limit, 1), 50)
    rows = db.scalars(
        select(InAppNotification)
        .where(
            InAppNotification.organization_id == context.membership.organization_id,
            InAppNotification.user_id == context.user.id,
        )
        .order_by(InAppNotification.created_at.desc())
        .limit(bounded_limit)
    ).all()
    return ok([_serialize_notification(item) for item in rows])


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: UUID,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    item = db.get(InAppNotification, notification_id)
    if item is None or item.organization_id != context.membership.organization_id or item.user_id != context.user.id:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(item)
    db.commit()
    return ok({"deleted": True, "id": str(notification_id)})
