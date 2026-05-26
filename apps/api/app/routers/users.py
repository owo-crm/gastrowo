from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, get_current_user, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_team
from app.db import get_db
from app.models import LocationMembership, OrganizationMembership, RoleEnum, User
from app.schemas import ProfilePatch, StaffPositionPatch

router = APIRouter(prefix="/users", tags=["users"])


def _require_team_access(context: OrgContext, db: Session) -> None:
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")


@router.get("")
def list_users(
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    rows = db.execute(
        select(User, OrganizationMembership)
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .where(OrganizationMembership.organization_id == context.membership.organization_id)
    ).all()

    user_ids = [user.id for user, _ in rows]
    rate_rows = db.scalars(select(LocationMembership).where(LocationMembership.user_id.in_(user_ids))).all() if user_ids else []
    rate_by_user: dict = {}
    for rate_row in rate_rows:
        current = rate_by_user.get(rate_row.user_id)
        rate = float(rate_row.hourly_rate_pln or 0)
        if current is None or rate > current:
            rate_by_user[rate_row.user_id] = rate

    data = []
    for user, membership in rows:
        data.append(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "avatar_url": user.avatar_url,
                "role": membership.role,
                "max_hours_per_week": membership.max_hours_per_week,
                "staff_position": membership.staff_position,
                "hourly_rate_pln": f"{rate_by_user.get(user.id, 0):.2f}",
            }
        )
    return ok(data)


@router.patch("/me")
def patch_me(
    payload: ProfilePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.full_name = payload.full_name.strip()
    user.avatar_url = payload.avatar_url
    db.commit()
    return ok({"id": str(user.id), "full_name": user.full_name, "avatar_url": user.avatar_url})


@router.patch("/{user_id}/position")
def patch_staff_position(
    user_id: UUID,
    payload: StaffPositionPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == context.membership.organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Organization member not found")
    if membership.role not in (RoleEnum.STAFF, RoleEnum.MANAGER):
        raise HTTPException(status_code=422, detail="Position can be assigned only to STAFF or MANAGER")
    next_position = payload.staff_position.strip()
    membership.staff_position = next_position
    membership.role = RoleEnum.MANAGER if next_position == "Manager" else RoleEnum.STAFF
    db.commit()
    return ok({"user_id": str(user_id), "staff_position": membership.staff_position, "role": membership.role})
