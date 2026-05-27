from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import OrgContext, get_current_organization, get_current_user, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_business_settings, can_manage_team
from app.db import get_db
from app.models import (
    Assignment,
    InviteToken,
    Location,
    LocationMembership,
    Organization,
    OrganizationMembership,
    OrganizationSubscription,
    RoleEnum,
    Shift,
    ShiftRequest,
    ShiftRequestStatusEnum,
    SubscriptionPlanEnum,
    SubscriptionStatusEnum,
    User,
)
from app.schemas import (
    LinkByEmailRequest,
    MemberRemovalImpactOut,
    MemberRemovalResultOut,
    OrganizationCreate,
    OrganizationOut,
    OrganizationPatch,
    OrganizationSettingsOut,
    OrganizationSettingsPatch,
    SubscriptionSummaryOut,
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


def _get_or_create_subscription(db: Session, organization_id: UUID) -> OrganizationSubscription:
    subscription = db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization_id))
    if subscription is None:
        subscription = OrganizationSubscription(
            organization_id=organization_id,
            plan=SubscriptionPlanEnum.FREE,
            status=SubscriptionStatusEnum.ACTIVE,
            billing_cycle="monthly",
        )
        db.add(subscription)
        db.flush()
    return subscription


def _subscription_caps(subscription: OrganizationSubscription) -> tuple[int | None, int | None]:
    if subscription.plan == SubscriptionPlanEnum.FREE:
        return 5, 1
    if subscription.plan == SubscriptionPlanEnum.PRO:
        return 25, None
    if subscription.plan == SubscriptionPlanEnum.BUSINESS:
        return None, 5
    return None, None


def _build_subscription_summary(db: Session, organization_id: UUID) -> SubscriptionSummaryOut:
    subscription = _get_or_create_subscription(db, organization_id)
    active_members_count = db.scalar(
        select(func.count()).select_from(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)
    ) or 0
    active_locations_count = db.scalar(select(func.count()).select_from(Location).where(Location.organization_id == organization_id)) or 0
    member_cap, location_cap = _subscription_caps(subscription)
    soft_limit_reached = bool(
        (member_cap is not None and active_members_count >= member_cap)
        or (location_cap is not None and active_locations_count >= location_cap)
    )
    return SubscriptionSummaryOut(
        plan=subscription.plan,
        status=subscription.status,
        billing_cycle=subscription.billing_cycle,
        trial_ends_at=subscription.trial_ends_at,
        current_period_ends_at=subscription.current_period_ends_at,
        active_members_count=active_members_count,
        active_locations_count=active_locations_count,
        member_cap=member_cap,
        location_cap=location_cap,
        soft_limit_reached=soft_limit_reached,
    )


def _member_removal_impact(db: Session, organization_id: UUID, user_id: UUID) -> MemberRemovalImpactOut:
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    user = db.get(User, user_id)
    if membership is None or user is None:
        raise HTTPException(status_code=404, detail="Member not found")

    future_assignments_count = db.scalar(
        select(func.count())
        .select_from(Assignment)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(Assignment.user_id == user_id, Shift.organization_id == organization_id, Shift.date >= date.today())
    ) or 0
    pending_shift_requests_count = db.scalar(
        select(func.count())
        .select_from(ShiftRequest)
        .join(Shift, Shift.id == ShiftRequest.shift_id)
        .where(
            Shift.organization_id == organization_id,
            Shift.date >= date.today(),
            ShiftRequest.status == ShiftRequestStatusEnum.PENDING,
            (
                (ShiftRequest.requester_user_id == user_id)
                | (ShiftRequest.requester_assignment_id.in_(select(Assignment.id).where(Assignment.user_id == user_id)))
                | (ShiftRequest.target_assignment_id.in_(select(Assignment.id).where(Assignment.user_id == user_id)))
            ),
        )
    ) or 0
    location_count = db.scalar(
        select(func.count())
        .select_from(LocationMembership)
        .join(Location, Location.id == LocationMembership.location_id)
        .where(LocationMembership.user_id == user_id, Location.organization_id == organization_id)
    ) or 0

    blocking_reason = None
    can_remove = True
    if membership.role == RoleEnum.ADMIN:
        admin_count = db.scalar(
            select(func.count()).select_from(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.role == RoleEnum.ADMIN,
            )
        ) or 0
        if admin_count <= 1:
            can_remove = False
            blocking_reason = "Cannot remove the last admin from the workspace"
    return MemberRemovalImpactOut(
        user_id=user.id,
        full_name=user.full_name,
        role=membership.role,
        future_assignments_count=future_assignments_count,
        pending_shift_requests_count=pending_shift_requests_count,
        location_count=location_count,
        can_remove=can_remove,
        blocking_reason=blocking_reason,
    )


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
    db.add(
        OrganizationSubscription(
            organization_id=org.id,
            plan=SubscriptionPlanEnum.PRO,
            status=SubscriptionStatusEnum.TRIALING,
            billing_cycle="monthly",
            trial_ends_at=datetime.now(UTC) + timedelta(days=30),
            current_period_ends_at=datetime.now(UTC) + timedelta(days=30),
        )
    )
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
    subscription_summary = _build_subscription_summary(db, context.membership.organization_id)
    if subscription_summary.member_cap is not None and subscription_summary.active_members_count >= subscription_summary.member_cap:
        raise HTTPException(status_code=402, detail="Team member limit reached for the current plan")
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


@router.get("/current/subscription")
def current_subscription(
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    return ok(_build_subscription_summary(db, context.membership.organization_id).model_dump(mode="json"))


@router.get("/members/{user_id}/removal-impact")
def member_removal_impact(
    user_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")
    return ok(_member_removal_impact(db, context.membership.organization_id, user_id).model_dump(mode="json"))


@router.delete("/members/{user_id}")
def remove_member(
    user_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")
    impact = _member_removal_impact(db, context.membership.organization_id, user_id)
    if not impact.can_remove:
        raise HTTPException(status_code=409, detail=impact.blocking_reason or "Member cannot be removed")

    future_assignment_ids = db.scalars(
        select(Assignment.id)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(Assignment.user_id == user_id, Shift.organization_id == context.membership.organization_id, Shift.date >= date.today())
    ).all()
    if future_assignment_ids:
        pending_requests = db.scalars(
            select(ShiftRequest).where(
                ShiftRequest.status == ShiftRequestStatusEnum.PENDING,
                (
                    (ShiftRequest.requester_user_id == user_id)
                    | (ShiftRequest.requester_assignment_id.in_(future_assignment_ids))
                    | (ShiftRequest.target_assignment_id.in_(future_assignment_ids))
                ),
            )
        ).all()
        for request in pending_requests:
            request.status = ShiftRequestStatusEnum.CANCELLED
            request.resolved_at = datetime.now(UTC)
            request.note = (request.note or "").strip() or "Cancelled automatically after member removal"
        assignments = db.scalars(select(Assignment).where(Assignment.id.in_(future_assignment_ids))).all()
        for assignment in assignments:
            db.delete(assignment)

    location_memberships = db.scalars(
        select(LocationMembership)
        .join(Location, Location.id == LocationMembership.location_id)
        .where(Location.organization_id == context.membership.organization_id, LocationMembership.user_id == user_id)
    ).all()
    for location_membership in location_memberships:
        db.delete(location_membership)
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == context.membership.organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is not None:
        db.delete(membership)
    db.commit()
    return ok(
        MemberRemovalResultOut(
            **impact.model_dump(),
            removed=True,
        ).model_dump(mode="json")
    )
