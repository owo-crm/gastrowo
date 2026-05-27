from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InAppNotification, NotificationTypeEnum, OrganizationMembership, RoleEnum


def notify_users(
    db: Session,
    organization_id: UUID,
    user_ids: Iterable[UUID],
    title: str,
    body: str,
    *,
    notification_type: NotificationTypeEnum = NotificationTypeEnum.GENERAL,
    action_url: str | None = None,
    entity_kind: str | None = None,
    entity_id: str | None = None,
) -> None:
    seen: set[UUID] = set()
    for user_id in user_ids:
        if user_id in seen:
            continue
        seen.add(user_id)
        db.add(
            InAppNotification(
                organization_id=organization_id,
                user_id=user_id,
                type=notification_type,
                title=title,
                body=body,
                action_url=action_url,
                entity_kind=entity_kind,
                entity_id=entity_id,
            )
        )


def notify_admins_and_managers(
    db: Session,
    organization_id: UUID,
    title: str,
    body: str,
    extra_user_ids: Iterable[UUID] = (),
    *,
    notification_type: NotificationTypeEnum = NotificationTypeEnum.GENERAL,
    action_url: str | None = None,
    entity_kind: str | None = None,
    entity_id: str | None = None,
) -> None:
    memberships = db.scalars(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.role.in_([RoleEnum.ADMIN, RoleEnum.MANAGER]),
        )
    ).all()
    target_user_ids = [item.user_id for item in memberships]
    target_user_ids.extend(extra_user_ids)
    notify_users(
        db,
        organization_id,
        target_user_ids,
        title,
        body,
        notification_type=notification_type,
        action_url=action_url,
        entity_kind=entity_kind,
        entity_id=entity_id,
    )
