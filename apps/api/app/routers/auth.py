from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import OrgContext, get_current_organization, oauth2_scheme, require_org_context
from app.core.envelope import ok
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.db import get_db
from app.models import (
    AuthSession,
    InAppNotification,
    InviteToken,
    Location,
    LocationMembership,
    Organization,
    OrganizationMembership,
    OrganizationSubscription,
    OtpChallenge,
    OtpPurposeEnum,
    RoleEnum,
    SubscriptionPlanEnum,
    SubscriptionStatusEnum,
    User,
    generate_auth_session_token,
    hash_auth_session_token,
)
from app.schemas import (
    InviteJoinVerifyRequest,
    LoginRequest,
    MeOut,
    MembershipOut,
    OtpSendRequest,
    OtpSendResponse,
    OtpVerifyRequest,
    OtpVerifyResponse,
    OrganizationSettingsOut,
    OwnerOnboardingCompleteRequest,
    SessionBootstrapResponse,
    SubscriptionSummaryOut,
)
from app.services.auth_email import send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])

NIL_ORG_ID = str(UUID(int=0))
OTP_EXPIRES_SECONDS = 300
OTP_REUSE_MIN_SECONDS = 60


def utc_now() -> datetime:
    return datetime.now(UTC)


def utc_value(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _pretty_name_from_email(email: str) -> str:
    stem = email.split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ")
    words = [item for item in stem.split() if item]
    if not words:
        return "New Worker"
    return " ".join(word.capitalize() for word in words)[:120]


def _issue_auth_payload(user: User, memberships: list[OrganizationMembership]) -> dict:
    active_membership = memberships[0] if memberships else None
    token = create_access_token(subject=str(user.id), org_id=str(active_membership.organization_id) if active_membership else NIL_ORG_ID)
    return {
        "access_token": token,
        "token_type": "bearer",
        "memberships": [MembershipOut.model_validate(item).model_dump(mode="json") for item in memberships],
        "active_organization_id": str(active_membership.organization_id) if active_membership else None,
        "role": active_membership.role if active_membership else None,
        "status": "linked" if memberships else "pending_link",
    }


def _build_subscription_summary(db: Session, organization_id: UUID | None) -> SubscriptionSummaryOut | None:
    if organization_id is None:
        return None
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

    active_members_count = db.scalar(
        select(func.count()).select_from(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)
    ) or 0
    active_locations_count = db.scalar(
        select(func.count()).select_from(Location).where(Location.organization_id == organization_id)
    ) or 0

    member_cap = None
    location_cap = None
    if subscription.plan == SubscriptionPlanEnum.FREE:
        member_cap = 5
        location_cap = 1
    elif subscription.plan == SubscriptionPlanEnum.PRO:
        member_cap = 25
    elif subscription.plan == SubscriptionPlanEnum.BUSINESS:
        location_cap = 5

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


def _set_auth_session_cookie(response: Response, session_token: str) -> None:
    response.set_cookie(
        key=settings.auth_session_cookie_name,
        value=session_token,
        max_age=settings.auth_session_ttl_days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=settings.auth_session_secure_cookie,
        path="/",
    )


def _clear_auth_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        httponly=True,
        samesite="lax",
        secure=settings.auth_session_secure_cookie,
        path="/",
    )


def _create_remembered_session(db: Session, response: Response, user: User, memberships: list[OrganizationMembership]) -> None:
    active_membership = memberships[0] if memberships else None
    session_token = generate_auth_session_token()
    db.add(
        AuthSession(
            user_id=user.id,
            organization_id=active_membership.organization_id if active_membership else None,
            token_hash=hash_auth_session_token(session_token),
            expires_at=utc_now() + timedelta(days=settings.auth_session_ttl_days),
        )
    )
    db.flush()
    _set_auth_session_cookie(response, session_token)


def _get_session_from_cookie(db: Session, session_token: str | None) -> AuthSession | None:
    if not session_token:
        return None
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_auth_session_token(session_token)))
    if session is None:
        return None
    if utc_value(session.expires_at) < utc_now():
        db.delete(session)
        db.commit()
        return None
    return session


def _ensure_single_business_rule(db: Session, user_id: UUID, organization_id: UUID | None = None) -> None:
    membership = db.scalar(select(OrganizationMembership).where(OrganizationMembership.user_id == user_id))
    if membership and (organization_id is None or membership.organization_id != organization_id):
        raise HTTPException(status_code=409, detail="This account already belongs to another business")


def _create_otp_challenge(db: Session, *, email: str, purpose: OtpPurposeEnum, invite_token: str | None) -> str:
    existing = db.scalar(
        select(OtpChallenge).where(
            OtpChallenge.email == email,
            OtpChallenge.purpose == purpose,
            OtpChallenge.invite_token == invite_token,
            OtpChallenge.consumed_at.is_(None),
        )
    )
    now = utc_now()
    if existing is not None and utc_value(existing.expires_at) > now + timedelta(seconds=OTP_REUSE_MIN_SECONDS):
        return existing.code

    code = str(int(datetime.now(UTC).timestamp() * 1000) % 1000000).zfill(6)
    db.execute(delete(OtpChallenge).where(OtpChallenge.email == email, OtpChallenge.purpose == purpose))
    db.add(
        OtpChallenge(
            email=email,
            purpose=purpose,
            code=code,
            invite_token=invite_token,
            expires_at=now + timedelta(seconds=OTP_EXPIRES_SECONDS),
        )
    )
    db.commit()
    return code


def _consume_otp(
    db: Session,
    *,
    email: str,
    purpose: OtpPurposeEnum,
    code: str,
    invite_token: str | None = None,
) -> OtpChallenge:
    challenge = db.scalar(
        select(OtpChallenge).where(
            OtpChallenge.email == email,
            OtpChallenge.purpose == purpose,
            OtpChallenge.code == code,
        )
    )
    if challenge is None:
        raise HTTPException(status_code=401, detail="Invalid code")
    if challenge.invite_token != invite_token:
        raise HTTPException(status_code=401, detail="Invalid code")
    if challenge.consumed_at is not None:
        raise HTTPException(status_code=409, detail="Code already used")
    if utc_value(challenge.expires_at) < utc_now():
        raise HTTPException(status_code=410, detail="Code expired")
    challenge.consumed_at = utc_now()
    db.commit()
    return challenge


def _settings_out(organization: Organization | None) -> OrganizationSettingsOut | None:
    if organization is None:
        return None
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
    )


@router.post("/otp/send")
def send_otp(payload: OtpSendRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    user = db.scalar(select(User).where(User.email == email))

    if payload.purpose == OtpPurposeEnum.LOGIN:
        if user is None:
            raise HTTPException(status_code=404, detail="Account with this email was not found")
        title = "Sign in to GastrOWO"
        subtitle = "Use this code to finish signing in."
    elif payload.purpose == OtpPurposeEnum.OWNER_SIGNUP:
        if user is not None:
            raise HTTPException(status_code=409, detail="Email already exists")
        title = "Verify your owner email"
        subtitle = "Confirm this email to continue setting up your business."
    elif payload.purpose == OtpPurposeEnum.WORKER_SIGNUP:
        if user is not None:
            raise HTTPException(status_code=409, detail="Email already exists")
        title = "Verify your worker email"
        subtitle = "Confirm this email to create your GastrOWO account."
    else:
        invite = db.scalar(select(InviteToken).where(InviteToken.token == payload.invite_token))
        if invite is None:
            raise HTTPException(status_code=404, detail="Invite not found")
        if invite.accepted_at is not None:
            raise HTTPException(status_code=409, detail="Invite already used")
        if utc_value(invite.expires_at) < utc_now():
            raise HTTPException(status_code=410, detail="Invite expired")
        if invite.email.lower() != email:
            raise HTTPException(status_code=400, detail="Invite email mismatch")
        if user is not None:
            _ensure_single_business_rule(db, user.id, invite.organization_id)
        title = "Confirm your invite"
        subtitle = "Use this code to join the invited business."

    code = _create_otp_challenge(db, email=email, purpose=payload.purpose, invite_token=payload.invite_token)
    send_otp_email(email=email, code=code, title=title, subtitle=subtitle)
    return ok(
        OtpSendResponse(
            sent=True,
            expires_in_seconds=OTP_EXPIRES_SECONDS,
            debug_code=None,
        ).model_dump(mode="json")
    )


@router.post("/otp/verify")
def verify_otp(payload: OtpVerifyRequest, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower()
    _consume_otp(db, email=email, purpose=payload.purpose, code=payload.code, invite_token=payload.invite_token)

    if payload.purpose == OtpPurposeEnum.LOGIN:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise HTTPException(status_code=404, detail="Account with this email was not found")
        memberships = db.scalars(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()
        _create_remembered_session(db, response, user, memberships)
        db.commit()
        return ok(_issue_auth_payload(user, memberships))

    if payload.purpose == OtpPurposeEnum.WORKER_SIGNUP:
        if not payload.full_name or not payload.full_name.strip():
            raise HTTPException(status_code=422, detail="Full name is required")
        existing = db.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise HTTPException(status_code=409, detail="Email already exists")
        user = User(email=email, full_name=payload.full_name.strip(), password_hash="")
        db.add(user)
        db.commit()
        db.refresh(user)
        _create_remembered_session(db, response, user, [])
        db.commit()
        return ok(_issue_auth_payload(user, []))

    if payload.purpose == OtpPurposeEnum.OWNER_SIGNUP:
        verification_token = create_access_token(
            subject=f"owner_signup:{email}",
            org_id=NIL_ORG_ID,
            expires_delta=timedelta(minutes=15),
        )
        return ok(
            OtpVerifyResponse(
                status="owner_verified",
                verification_token=verification_token,
            ).model_dump(mode="json")
        )

    raise HTTPException(status_code=400, detail="Use invite join verification for this flow")


@router.post("/onboarding/owner/complete")
def complete_owner_onboarding(payload: OwnerOnboardingCompleteRequest, response: Response, db: Session = Depends(get_db)):
    try:
        token_payload = decode_token(payload.verification_token)
        subject = str(token_payload.get("sub", ""))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid verification token") from exc

    prefix = "owner_signup:"
    if not subject.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid verification token")
    email = subject[len(prefix) :].lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status_code=409, detail="Email already exists")
    if db.scalar(select(Organization).where(Organization.name == payload.organization_name.strip())) is not None:
        raise HTTPException(status_code=409, detail="Organization name already exists")

    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        onboarding_source=payload.source.strip(),
    )
    org = Organization(name=payload.organization_name.strip())
    db.add_all([user, org])
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
            trial_ends_at=utc_now() + timedelta(days=30),
            current_period_ends_at=utc_now() + timedelta(days=30),
        )
    )
    _create_remembered_session(db, response, user, [membership])
    db.commit()
    db.refresh(user)
    return ok(_issue_auth_payload(user, [membership]))


@router.post("/login")
@router.post("/login/password")
def login_with_password(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None:
        raise HTTPException(status_code=404, detail="Account with this email was not found")
    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    memberships = db.scalars(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()
    if not memberships or memberships[0].role != RoleEnum.ADMIN:
        raise HTTPException(status_code=403, detail="Password login is available only for owners")
    _create_remembered_session(db, response, user, memberships)
    db.commit()
    return ok(_issue_auth_payload(user, memberships))


@router.post("/invites/join/verify")
def verify_invite_join(payload: InviteJoinVerifyRequest, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower()
    invite = db.scalar(select(InviteToken).where(InviteToken.token == payload.invite_token))
    if invite is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=409, detail="Invite already used")
    if utc_value(invite.expires_at) < utc_now():
        raise HTTPException(status_code=410, detail="Invite expired")
    if invite.email.lower() != email:
        raise HTTPException(status_code=400, detail="Invite email mismatch")

    _consume_otp(db, email=email, purpose=OtpPurposeEnum.INVITE_JOIN, code=payload.code, invite_token=payload.invite_token)

    organization_id = invite.organization_id
    invited_by = invite.invited_by
    membership_role = invite.role

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, full_name=_pretty_name_from_email(email), password_hash="")
        db.add(user)
        db.flush()
    else:
        _ensure_single_business_rule(db, user.id, organization_id)

    membership = db.scalar(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id))
    if membership is None:
        membership = OrganizationMembership(
            organization_id=organization_id,
            user_id=user.id,
            role=membership_role,
            max_hours_per_week=40,
            staff_position=None,
        )
        db.add(membership)
        db.flush()

    location_ids = db.scalars(select(Location.id).where(Location.organization_id == organization_id)).all()
    for location_id in location_ids:
        exists = db.scalar(
            select(LocationMembership).where(LocationMembership.location_id == location_id, LocationMembership.user_id == user.id)
        )
        if exists is None:
            db.add(LocationMembership(location_id=location_id, user_id=user.id, priority=0, hourly_rate_pln=0))

    db.delete(invite)
    db.add(
        InAppNotification(
            organization_id=organization_id,
            user_id=invited_by,
            type=NotificationTypeEnum.TEAM,
            title="Invite accepted",
            body=f"{user.full_name} joined your business",
            action_url="/team",
            entity_kind="user",
            entity_id=str(user.id),
        )
    )
    _create_remembered_session(db, response, user, [membership])
    db.commit()
    db.refresh(user)
    return ok(_issue_auth_payload(user, [membership]))


@router.get("/session")
def bootstrap_session(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=settings.auth_session_cookie_name),
    db: Session = Depends(get_db),
):
    session = _get_session_from_cookie(db, session_token)
    if session is None:
        _clear_auth_session_cookie(response)
        raise HTTPException(status_code=401, detail="No remembered session")
    user = db.get(User, session.user_id)
    if user is None:
        _clear_auth_session_cookie(response)
        raise HTTPException(status_code=401, detail="User not found")
    memberships = db.scalars(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()
    session.last_seen_at = utc_now()
    session.expires_at = utc_now() + timedelta(days=settings.auth_session_ttl_days)
    db.commit()
    return ok(SessionBootstrapResponse(**_issue_auth_payload(user, memberships)).model_dump(mode="json"))


@router.post("/logout")
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=settings.auth_session_cookie_name),
    db: Session = Depends(get_db),
):
    session = _get_session_from_cookie(db, session_token)
    if session is not None:
        db.delete(session)
        db.commit()
    _clear_auth_session_cookie(response)
    return ok({"logged_out": True})


@router.get("/me")
def me(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = decode_token(token)
        user_id = UUID(payload.get("sub"))
        token_org_id_raw = payload.get("org_id")
        token_org_id = UUID(token_org_id_raw) if token_org_id_raw else None
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from exc

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    memberships = db.scalars(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()
    active_membership = None
    if token_org_id and token_org_id != UUID(int=0):
        active_membership = next((item for item in memberships if item.organization_id == token_org_id), None)
    if active_membership is None and memberships:
        active_membership = memberships[0]

    organization = get_current_organization(OrgContext(user=user, membership=active_membership), db) if active_membership else None

    payload_out = MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        active_organization_id=active_membership.organization_id if active_membership else None,
        active_organization_name=organization.name if organization else None,
        role=active_membership.role if active_membership else None,
        is_linked=bool(memberships),
        memberships=[MembershipOut.model_validate(item) for item in memberships],
        organization_settings=_settings_out(organization),
        subscription=_build_subscription_summary(db, active_membership.organization_id if active_membership else None),
    )
    return ok(payload_out.model_dump(mode="json"))
    NotificationTypeEnum,
