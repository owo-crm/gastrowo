from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_business_settings, can_manage_team, membership_permission_overrides
from app.db import get_db
from app.models import Location, LocationMembership, OrganizationMembership, RoleEnum, User
from app.schemas import WorkerSetupOut, WorkerSetupPatch

router = APIRouter(prefix="/workers", tags=["workers"])


def _require_team_access(context: OrgContext, db: Session) -> None:
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")


def _get_worker_membership_or_404(db: Session, context: OrgContext, user_id: UUID) -> OrganizationMembership:
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == context.membership.organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Organization member not found")
    if membership.role not in (RoleEnum.STAFF, RoleEnum.MANAGER, RoleEnum.ADMIN):
        raise HTTPException(status_code=422, detail="Worker setup applies only to organization workers")
    return membership


@router.get("/{user_id}/setup")
def get_worker_setup(
    user_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    membership = _get_worker_membership_or_404(db, context, user_id)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    locations = db.scalars(
        select(Location)
        .where(Location.organization_id == context.membership.organization_id)
        .order_by(Location.name, Location.id)
    ).all()

    membership_rows = db.scalars(
        select(LocationMembership).where(LocationMembership.user_id == user_id)
    ).all()
    membership_by_location = {item.location_id: item for item in membership_rows}

    items = []
    for location in locations:
        row = membership_by_location.get(location.id)
        items.append(
            {
                "location_id": location.id,
                "location_name": location.name,
                "priority": row.priority if row is not None else 0,
                "hourly_rate_pln": row.hourly_rate_pln if row is not None else 0,
            }
        )

    return ok(
        WorkerSetupOut(
            user_id=user.id,
            full_name=user.full_name,
            role=membership.role,
            staff_position=membership.staff_position,
            locations=items,
            permission_overrides=membership_permission_overrides(membership),
        ).model_dump(mode="json")
    )


@router.patch("/{user_id}/setup")
def patch_worker_setup(
    user_id: UUID,
    payload: WorkerSetupPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    membership = _get_worker_membership_or_404(db, context, user_id)
    organization = get_current_organization(context, db)

    valid_location_ids = set(
        db.scalars(
            select(Location.id).where(Location.organization_id == context.membership.organization_id)
        ).all()
    )
    if not valid_location_ids:
        raise HTTPException(status_code=422, detail="No locations found in organization")

    incoming_by_location = {}
    for item in payload.locations:
        if item.location_id not in valid_location_ids:
            raise HTTPException(status_code=400, detail=f"Location {item.location_id} does not belong to organization")
        incoming_by_location[item.location_id] = item

    existing_rows = db.scalars(
        select(LocationMembership).where(
            LocationMembership.user_id == user_id,
            LocationMembership.location_id.in_(list(valid_location_ids)),
        )
    ).all()
    existing_by_location = {row.location_id: row for row in existing_rows}

    for location_id, item in incoming_by_location.items():
        row = existing_by_location.get(location_id)
        if row is None:
            db.add(
                LocationMembership(
                    location_id=location_id,
                    user_id=user_id,
                    priority=item.priority,
                    hourly_rate_pln=item.hourly_rate_pln,
                )
            )
        else:
            row.priority = item.priority
            row.hourly_rate_pln = item.hourly_rate_pln

    if payload.permission_overrides is not None:
        if not can_manage_business_settings(context.membership, organization):
            raise HTTPException(status_code=403, detail="Business permission overrides are disabled for this account")
        overrides = payload.permission_overrides.model_dump()
        for key, value in overrides.items():
            setattr(membership, key, value)

    db.commit()
    return ok({"updated": True, "user_id": str(user_id), "count": len(incoming_by_location)})
