"""Who counts as the owner's test account: the secret-link login target, or a platform admin."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import OrganizationMembership, RoleEnum, User


def dev_login_configured() -> bool:
    return bool(settings.dev_login_secret) or (settings.dev_login_enabled and settings.app_env != "production")


def dev_login_user(db: Session) -> User | None:
    """The owner's test admin: DEV_LOGIN_EMAIL, or the oldest admin when it isn't set."""
    if settings.dev_login_email:
        return db.scalar(select(User).where(User.email == settings.dev_login_email.lower()))
    return db.scalar(
        select(User)
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .where(OrganizationMembership.role == RoleEnum.ADMIN)
        .order_by(User.created_at)
    )


def is_demo_account(db: Session, user: User) -> bool:
    if user.email.lower() in settings.parsed_platform_admin_emails:
        return True
    if not dev_login_configured():
        return False
    target = dev_login_user(db)
    return target is not None and target.id == user.id
