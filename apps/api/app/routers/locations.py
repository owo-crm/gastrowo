from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_team, membership_permission_overrides
from app.db import get_db
from app.models import Location, LocationMembership, OrganizationMembership, OrganizationSubscription, RoleEnum, SubscriptionPlanEnum, User
from app.schemas import LocationCreate, LocationMemberOut, LocationMemberPatch, LocationOut, LocationPatch

router = APIRouter(prefix="/locations", tags=["locations"])


def _require_team_access(context: OrgContext, db: Session) -> None:
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")


def _get_location_or_404(db: Session, organization_id: UUID, location_id: UUID) -> Location:
    location = db.scalar(
        select(Location).where(
            Location.id == location_id,
            Location.organization_id == organization_id,
        )
    )
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    return location


def _location_cap_for_plan(plan: SubscriptionPlanEnum) -> int | None:
    if plan == SubscriptionPlanEnum.FREE:
        return 1
    if plan == SubscriptionPlanEnum.BUSINESS:
        return 5
    return None


@router.get("")
def list_locations(
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    locations = db.scalars(
        select(Location).where(Location.organization_id == context.membership.organization_id)
    ).all()
    location_ids = [location.id for location in locations]
    manager_rows = (
        db.execute(
            select(LocationMembership.location_id, User.full_name)
            .join(User, User.id == LocationMembership.user_id)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .where(
                LocationMembership.location_id.in_(location_ids),
                OrganizationMembership.organization_id == context.membership.organization_id,
                OrganizationMembership.role == RoleEnum.MANAGER,
            )
            .order_by(User.full_name)
        ).all()
        if location_ids
        else []
    )
    manager_names_by_location: dict[UUID, list[str]] = {location_id: [] for location_id in location_ids}
    manager_ids_by_location: dict[UUID, list[UUID]] = {location_id: [] for location_id in location_ids}
    for location_id, full_name in manager_rows:
        manager_names_by_location.setdefault(location_id, []).append(full_name)
    manager_id_rows = (
        db.execute(
            select(LocationMembership.location_id, User.id)
            .join(User, User.id == LocationMembership.user_id)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .where(
                LocationMembership.location_id.in_(location_ids),
                OrganizationMembership.organization_id == context.membership.organization_id,
                OrganizationMembership.role == RoleEnum.MANAGER,
            )
            .order_by(User.full_name)
        ).all()
        if location_ids
        else []
    )
    for location_id, manager_id in manager_id_rows:
        manager_ids_by_location.setdefault(location_id, []).append(manager_id)

    data = [
        LocationOut(
            id=location.id,
            name=location.name,
            timezone=location.timezone,
            manager_user_ids=manager_ids_by_location.get(location.id, []),
            manager_names=manager_names_by_location.get(location.id, []),
        ).model_dump(mode="json")
        for location in locations
    ]
    return ok(data)


@router.post("")
def create_location(
    payload: LocationCreate,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    subscription = db.scalar(
        select(OrganizationSubscription).where(OrganizationSubscription.organization_id == context.membership.organization_id)
    )
    if subscription is not None:
        location_cap = _location_cap_for_plan(subscription.plan)
        current_count = db.scalar(
            select(func.count()).select_from(Location).where(Location.organization_id == context.membership.organization_id)
        ) or 0
        if location_cap is not None and current_count >= location_cap:
            raise HTTPException(status_code=402, detail="Location limit reached for the current plan")
    location = Location(
        organization_id=context.membership.organization_id,
        name=payload.name,
        timezone=payload.timezone,
    )
    db.add(location)
    db.flush()

    staff_user_ids = db.scalars(
        select(OrganizationMembership.user_id).where(
            OrganizationMembership.organization_id == context.membership.organization_id,
            OrganizationMembership.role == RoleEnum.STAFF,
        )
    ).all()
    for staff_user_id in staff_user_ids:
        db.add(
            LocationMembership(
                location_id=location.id,
                user_id=staff_user_id,
                priority=0,
                hourly_rate_pln=0,
            )
        )

    db.commit()
    db.refresh(location)
    return ok(
        LocationOut(id=location.id, name=location.name, timezone=location.timezone, manager_user_ids=[], manager_names=[]).model_dump(mode="json")
    )


@router.patch("/{location_id}")
def patch_location(
    location_id: UUID,
    payload: LocationPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    location = _get_location_or_404(db, context.membership.organization_id, location_id)
    location.name = payload.name
    location.timezone = payload.timezone
    manager_ids = list(dict.fromkeys(payload.manager_user_ids))
    if manager_ids:
        manager_memberships = db.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == context.membership.organization_id,
                OrganizationMembership.user_id.in_(manager_ids),
                OrganizationMembership.role == RoleEnum.MANAGER,
            )
        ).all()
        found_manager_ids = {item.user_id for item in manager_memberships}
        invalid_ids = [manager_id for manager_id in manager_ids if manager_id not in found_manager_ids]
        if invalid_ids:
            raise HTTPException(status_code=400, detail="One or more selected users are not managers in this organization")

    existing_manager_rows = db.scalars(
        select(LocationMembership)
        .join(OrganizationMembership, OrganizationMembership.user_id == LocationMembership.user_id)
        .where(
            LocationMembership.location_id == location_id,
            OrganizationMembership.organization_id == context.membership.organization_id,
            OrganizationMembership.role == RoleEnum.MANAGER,
        )
    ).all()
    existing_manager_ids = {item.user_id for item in existing_manager_rows}

    target_manager_ids = set(manager_ids)
    to_add = target_manager_ids - existing_manager_ids
    to_remove = existing_manager_ids - target_manager_ids

    for manager_id in to_add:
        db.add(
            LocationMembership(
                location_id=location_id,
                user_id=manager_id,
                hourly_rate_pln=0,
                priority=3,
            )
        )
    for row in existing_manager_rows:
        if row.user_id in to_remove:
            db.delete(row)

    db.commit()
    db.refresh(location)
    manager_names = db.scalars(
        select(User.full_name)
        .join(LocationMembership, LocationMembership.user_id == User.id)
        .where(LocationMembership.location_id == location_id, User.id.in_(list(target_manager_ids)))
        .order_by(User.full_name)
    ).all() if target_manager_ids else []
    return ok(
        LocationOut(
            id=location.id,
            name=location.name,
            timezone=location.timezone,
            manager_user_ids=list(target_manager_ids),
            manager_names=list(manager_names),
        ).model_dump(mode="json")
    )


@router.delete("/{location_id}")
def delete_location(
    location_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    location = _get_location_or_404(db, context.membership.organization_id, location_id)
    db.delete(location)
    db.commit()
    return ok({"deleted": True, "id": str(location_id)})


@router.get("/{location_id}/members")
def location_members(
    location_id: UUID,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    _get_location_or_404(db, context.membership.organization_id, location_id)

    rows = db.execute(
        select(User, OrganizationMembership, LocationMembership)
        .join(LocationMembership, LocationMembership.user_id == User.id)
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .where(
            LocationMembership.location_id == location_id,
            OrganizationMembership.organization_id == context.membership.organization_id,
        )
        .order_by(User.full_name)
    ).all()

    data = [
        LocationMemberOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=membership.role,
            staff_position=membership.staff_position,
            max_hours_per_week=membership.max_hours_per_week,
            hourly_rate_pln=location_membership.hourly_rate_pln,
            priority=location_membership.priority,
            permission_overrides=membership_permission_overrides(membership),
        ).model_dump(mode="json")
        for user, membership, location_membership in rows
    ]

    return ok(data)


@router.patch("/{location_id}/members/{user_id}")
def patch_location_member(
    location_id: UUID,
    user_id: UUID,
    payload: LocationMemberPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    _get_location_or_404(db, context.membership.organization_id, location_id)

    location_membership = db.scalar(
        select(LocationMembership).where(
            LocationMembership.location_id == location_id,
            LocationMembership.user_id == user_id,
        )
    )
    if location_membership is None:
        raise HTTPException(status_code=404, detail="Location member not found")

    organization_membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == context.membership.organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if organization_membership is None:
        raise HTTPException(status_code=404, detail="Organization member not found")

    location_membership.hourly_rate_pln = payload.hourly_rate_pln
    location_membership.priority = payload.priority
    if payload.max_hours_per_week is not None:
        organization_membership.max_hours_per_week = payload.max_hours_per_week

    db.commit()

    user = db.get(User, user_id)
    assert user is not None
    response = LocationMemberOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=organization_membership.role,
        staff_position=organization_membership.staff_position,
        max_hours_per_week=organization_membership.max_hours_per_week,
        hourly_rate_pln=location_membership.hourly_rate_pln,
        priority=location_membership.priority,
        permission_overrides=membership_permission_overrides(organization_membership),
    )
    return ok(response.model_dump(mode="json"))
