from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
import uuid
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
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
    TeamImportRequest,
)
from app.services.auth_email import send_invite_email
from app.services.positions import ensure_catalog
from app.services.demo_access import is_demo_account
from app.services.demo_restaurant import seed_demo_restaurant
from app.services.labor_rules import default_timezone_for, locale_settings
from app.services.billing import DEFAULT_LOCATION_PRIORITY, build_subscription_summary, require_feature

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
        **locale_settings(organization),
    ).model_dump(mode="json")


def _require_business_settings_access(context: OrgContext, organization: Organization) -> None:
    if can_manage_business_settings(context.membership, organization):
        return
    raise HTTPException(status_code=403, detail="Business settings access is disabled for this role")


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
    # One account = one business; otherwise any user could farm unlimited PRO trials.
    if db.scalar(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)) is not None:
        raise HTTPException(status_code=409, detail="This account already belongs to another business")
    org = Organization(name=payload.name, country=payload.country)
    db.add(org)
    db.flush()

    membership = OrganizationMembership(
        organization_id=org.id,
        user_id=user.id,
        role=RoleEnum.ADMIN,
        max_hours_per_week=60,
        staff_position=None,
    )
    location = Location(organization_id=org.id, name="Main Location", timezone=default_timezone_for(payload.country))

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
    if payload.name is not None:
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
    if payload.country is not None and payload.country != organization.country:
        # Changes currency, labour rules and the payroll CSV format; stored amounts are not converted.
        previous_default = default_timezone_for(organization.country or "US")
        for location in db.scalars(select(Location).where(Location.organization_id == organization.id)).all():
            if location.timezone == previous_default:
                location.timezone = default_timezone_for(payload.country)
        organization.country = payload.country
    db.commit()
    db.refresh(organization)
    return ok({"id": str(organization.id), "name": organization.name, **locale_settings(organization)})


@router.post("/current/demo-restaurant")
def fill_demo_restaurant(
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN)),
    db: Session = Depends(get_db),
):
    """Wipe this business and fill it with a running restaurant. Only for the owner's test account."""
    if not is_demo_account(db, context.user):
        raise HTTPException(status_code=403, detail="Demo data is only available on the test account")
    organization = get_current_organization(context, db)
    return ok(seed_demo_restaurant(db, organization, context.user))


@router.patch("/current/settings")
def patch_current_organization_settings(
    payload: OrganizationSettingsPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    require_feature(db, context.membership.organization_id, "permissions")
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
    subscription_summary = build_subscription_summary(db, context.membership.organization_id)
    if subscription_summary.member_cap is not None and subscription_summary.active_members_count >= subscription_summary.member_cap:
        limit = subscription_summary.member_cap
        hint = "Upgrade to Starter for up to 30 people." if subscription_summary.plan.value == "free" else "Upgrade to Pro for no limit."
        raise HTTPException(status_code=402, detail=f"Your plan covers {limit} people. {hint}")
    normalized_email = payload.email.lower()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        # Re-inviting replaces the previous link instead of piling up pending invites.
        db.execute(
            delete(InviteToken).where(
                InviteToken.organization_id == context.membership.organization_id,
                InviteToken.email == normalized_email,
                InviteToken.accepted_at.is_(None),
            )
        )
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
            db.add(LocationMembership(location_id=location_id, user_id=user.id, priority=DEFAULT_LOCATION_PRIORITY, hourly_rate_pln=0))

    db.commit()
    return ok(
        {
            "status": "linked",
            "user_id": str(user.id),
            "organization_id": str(context.membership.organization_id),
            "role": membership.role,
        }
    )


@router.post("/members/import")
def import_team(
    payload: TeamImportRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    """Invite many people at once (from a CSV). Each gets the usual email invite; name, position and
    rate are applied when they join. Existing accounts are skipped: add those one by one."""
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")
    summary = build_subscription_summary(db, organization.id)
    seats_left = None if summary.member_cap is None else max(summary.member_cap - summary.active_members_count, 0)
    pending = {
        email.lower()
        for email in db.scalars(select(InviteToken.email).where(InviteToken.organization_id == organization.id, InviteToken.accepted_at.is_(None))).all()
    }

    invited: list[str] = []
    skipped: list[dict] = []
    seen: set[str] = set()
    for row in payload.rows:
        email = row.email.strip().lower()
        try:
            email = validate_email(email, check_deliverability=False).normalized.lower()
        except EmailNotValidError:
            skipped.append({"email": row.email, "reason": "invalid_email"})
            continue
        if email in seen:
            skipped.append({"email": email, "reason": "duplicate"})
            continue
        seen.add(email)
        if db.scalar(select(User.id).where(User.email == email)) is not None:
            skipped.append({"email": email, "reason": "has_account"})
            continue
        if seats_left is not None and seats_left <= 0:
            skipped.append({"email": email, "reason": "plan_limit"})
            continue
        if email in pending:
            db.execute(delete(InviteToken).where(InviteToken.organization_id == organization.id, InviteToken.email == email, InviteToken.accepted_at.is_(None)))
        token = uuid.uuid4().hex
        db.add(
            InviteToken(
                organization_id=organization.id,
                email=email,
                role=RoleEnum.STAFF,
                token=token,
                invited_by=context.user.id,
                expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=7),
                full_name=(row.name or "").strip() or None,
                staff_position=(row.position or "").strip() or None,
                hourly_rate=row.rate,
            )
        )
        if row.position and row.position.strip():
            ensure_catalog(db, organization.id, [row.position.strip()])
        db.flush()
        join_link = f"{settings.frontend_url.rstrip('/')}/join?email={email}&token={token}"
        send_invite_email(email=email, business_name=organization.name, join_link=join_link)
        invited.append(email)
        if seats_left is not None:
            seats_left -= 1
    db.commit()
    return ok({"invited": invited, "skipped": skipped})


@router.get("/current/subscription")
def current_subscription(
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    return ok(build_subscription_summary(db, context.membership.organization_id).model_dump(mode="json"))


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


@router.get("/invites")
def list_pending_invites(
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    """Invites that were sent but not accepted yet, so owners can see who is still missing."""
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")
    invites = db.scalars(
        select(InviteToken)
        .where(InviteToken.organization_id == context.membership.organization_id, InviteToken.accepted_at.is_(None))
        .order_by(InviteToken.expires_at.desc())
    ).all()
    return ok(
        [
            {"id": str(item.id), "email": item.email, "expires_at": item.expires_at}
            for item in invites
        ]
    )


@router.delete("/invites/{invite_id}")
def cancel_invite(
    invite_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")
    invite = db.get(InviteToken, invite_id)
    if invite is None or invite.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Invite not found")
    db.delete(invite)
    db.commit()
    return ok({"deleted": True, "id": str(invite_id)})
