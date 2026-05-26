from __future__ import annotations

from datetime import UTC, datetime, timedelta
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import OrgContext, get_current_organization, get_current_user, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_business_settings, can_manage_team
from app.db import get_db
from app.models import InviteToken, Location, LocationMembership, Organization, OrganizationMembership, RoleEnum, User
from app.schemas import (
    LinkByEmailRequest,
    OrganizationCreate,
    OrganizationOut,
    OrganizationPatch,
    OrganizationSettingsOut,
    OrganizationSettingsPatch,
)
from app.services.auth_email import send_invite_email

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _serialize_settings(organization: Organization) -> dict:
    return OrganizationSettingsOut(
        staff_can_submit_revenue_reports=organization.staff_can_submit_revenue_reports,
        staff_can_delete_revenue_reports=organization.staff_can_delete_revenue_reports,
        manager_can_submit_revenue_reports=organization.manager_can_submit_revenue_reports,
        manager_can_delete_revenue_reports=organization.manager_can_delete_revenue_reports,
        manager_can_view_full_dashboard=organization.manager_can_view_full_dashboard,
        manager_can_view_payroll=organization.manager_can_view_payroll,
        manager_can_manage_team=organization.manager_can_manage_team,
        manager_can_manage_business_settings=organization.manager_can_manage_business_settings,
        manager_can_access_notes=organization.manager_can_access_notes,
        manager_can_access_inventory=organization.manager_can_access_inventory,
    ).model_dump(mode="json")


def _require_business_settings_access(context: OrgContext, organization: Organization) -> None:
    if can_manage_business_settings(context.membership, organization):
        return
    raise HTTPException(status_code=403, detail="Business settings access is disabled for this role")


@router.get("")
def list_organizations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    organizations = db.execute(
        select(Organization, OrganizationMembership)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(OrganizationMembership.user_id == user.id)
    ).all()

    data = [
        {
            "id": str(org.id),
            "name": org.name,
            "role": membership.role,
            "max_hours_per_week": membership.max_hours_per_week,
        }
        for org, membership in organizations
    ]
    return ok(data)


@router.post("")
def create_organization(
    payload: OrganizationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = Organization(name=payload.name)
    db.add(org)
    db.flush()

    membership = OrganizationMembership(
        organization_id=org.id,
        user_id=user.id,
        role=RoleEnum.ADMIN,
        max_hours_per_week=60,
        staff_position=None,
    )
    location = Location(organization_id=org.id, name="Main Location", timezone="Europe/Warsaw")

    db.add_all([membership, location])
    db.flush()
    db.add(LocationMembership(location_id=location.id, user_id=user.id))
    db.commit()

    return ok(OrganizationOut.model_validate(org).model_dump(mode="json"))


@router.patch("/current")
def patch_current_organization(
    payload: OrganizationPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    _require_business_settings_access(context, organization)
    normalized_name = payload.name.strip()
    existing = db.scalar(
        select(Organization).where(
            Organization.name == normalized_name,
            Organization.id != organization.id,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Organization name already exists")
    organization.name = normalized_name
    db.commit()
    db.refresh(organization)
    return ok({"id": str(organization.id), "name": organization.name})


@router.patch("/current/settings")
def patch_current_organization_settings(
    payload: OrganizationSettingsPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    _require_business_settings_access(context, organization)
    organization.staff_can_submit_revenue_reports = payload.staff_can_submit_revenue_reports
    organization.staff_can_delete_revenue_reports = payload.staff_can_delete_revenue_reports
    organization.manager_can_submit_revenue_reports = payload.manager_can_submit_revenue_reports
    organization.manager_can_delete_revenue_reports = payload.manager_can_delete_revenue_reports
    organization.manager_can_view_full_dashboard = payload.manager_can_view_full_dashboard
    organization.manager_can_view_payroll = payload.manager_can_view_payroll
    organization.manager_can_manage_team = payload.manager_can_manage_team
    organization.manager_can_manage_business_settings = payload.manager_can_manage_business_settings
    organization.manager_can_access_notes = payload.manager_can_access_notes
    organization.manager_can_access_inventory = payload.manager_can_access_inventory
    db.commit()
    db.refresh(organization)
    return ok(_serialize_settings(organization))


@router.post("/members/link-by-email")
def link_member_by_email(
    payload: LinkByEmailRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")
    normalized_email = payload.email.lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        invite_token = uuid.uuid4().hex
        invite = InviteToken(
            organization_id=context.membership.organization_id,
            email=normalized_email,
            role=RoleEnum.STAFF,
            token=invite_token,
            invited_by=context.user.id,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=48),
        )
        db.add(invite)
        db.commit()
        join_link = f"{settings.frontend_url.rstrip('/')}/join?email={normalized_email}&token={invite_token}"
        send_invite_email(email=normalized_email, business_name=organization.name, join_link=join_link)
        return ok(
            {
                "status": "invited",
                "email": normalized_email,
                "debug_join_link": join_link if settings.app_env != "production" else None,
                "expires_at": invite.expires_at,
            }
        )

    if payload.name and payload.name.strip():
        user.full_name = payload.name.strip()

    existing_membership = db.scalar(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id))
    if existing_membership is not None:
        if existing_membership.organization_id == context.membership.organization_id:
            db.commit()
            return ok(
                {
                    "status": "already_member",
                    "user_id": str(user.id),
                    "organization_id": str(existing_membership.organization_id),
                    "role": existing_membership.role,
                }
            )
        raise HTTPException(status_code=409, detail="This user already belongs to another business")

    membership = OrganizationMembership(
        organization_id=context.membership.organization_id,
        user_id=user.id,
        role=RoleEnum.STAFF,
        max_hours_per_week=40,
        staff_position=None,
    )
    db.add(membership)
    db.flush()
    location_ids = db.scalars(select(Location.id).where(Location.organization_id == context.membership.organization_id)).all()
    for location_id in location_ids:
        exists = db.scalar(select(LocationMembership).where(LocationMembership.location_id == location_id, LocationMembership.user_id == user.id))
        if exists is None:
            db.add(LocationMembership(location_id=location_id, user_id=user.id, priority=0, hourly_rate_pln=0))

    db.commit()
    return ok(
        {
            "status": "linked",
            "user_id": str(user.id),
            "organization_id": str(context.membership.organization_id),
            "role": membership.role,
        }
    )
