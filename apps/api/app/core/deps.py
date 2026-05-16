from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db import get_db
from app.models import Organization, OrganizationMembership, RoleEnum, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


@dataclass
class OrgContext:
    user: User
    membership: OrganizationMembership



def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        user_id = UUID(payload.get("sub"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from exc

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user



def require_org_context(*roles: RoleEnum):
    def _dependency(
        token: str = Depends(oauth2_scheme),
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> OrgContext:
        try:
            payload = decode_token(token)
            org_id = UUID(payload.get("org_id"))
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has no organization") from exc

        membership = db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org_id,
                OrganizationMembership.user_id == user.id,
            )
        )
        if membership is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organization membership")

        if roles and membership.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

        return OrgContext(user=user, membership=membership)

    return _dependency


def get_current_organization(context: OrgContext, db: Session) -> Organization:
    organization = db.get(Organization, context.membership.organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return organization
