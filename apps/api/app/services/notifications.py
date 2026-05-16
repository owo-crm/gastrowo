from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InAppNotification, OrganizationMembership, RoleEnum


def notify_users(db: Session, organization_id: UUID, user_ids: Iterable[UUID], title: str, body: str) -> None:
    seen: set[UUID] = set()
    for user_id in user_ids:
        if user_id in seen:
            continue
        seen.add(user_id)
        db.add(
            InAppNotification(
                organization_id=organization_id,
                user_id=user_id,
                title=title,
                body=body,
            )
        )


def notify_admins_and_managers(db: Session, organization_id: UUID, title: str, body: str, extra_user_ids: Iterable[UUID] = ()) -> None:
    memberships = db.scalars(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.role.in_([RoleEnum.ADMIN, RoleEnum.MANAGER]),
        )
    ).all()
    target_user_ids = [item.user_id for item in memberships]
    target_user_ids.extend(extra_user_ids)
    notify_users(db, organization_id, target_user_ids, title, body)
