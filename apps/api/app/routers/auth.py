from __future__ import annotations

from datetime import UTC, datetime, timedelta
import hmac
import time as time_module
import secrets
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
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
    NotificationTypeEnum,
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
    InviteAcceptRequest,
    DevLoginRequest,
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
)
from app.services.auth_email import send_otp_email
from app.services.labor_rules import default_timezone_for, locale_settings
from app.services.billing import DEFAULT_LOCATION_PRIORITY, build_subscription_summary, grant_comp_pro
from app.services.demo_access import dev_login_user, is_demo_account

router = APIRouter(prefix="/auth", tags=["auth"])

NIL_ORG_ID = str(UUID(int=0))
OTP_EXPIRES_SECONDS = 300
OTP_REUSE_MIN_SECONDS = 60
OTP_RESEND_COOLDOWN_SECONDS = 30
OTP_MAX_FAILED_ATTEMPTS = 5


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
    if existing is not None and utc_value(existing.created_at) > now - timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS):
        raise HTTPException(status_code=429, detail="Please wait before requesting another code")
    if (
        existing is not None
        and existing.failed_attempts < OTP_MAX_FAILED_ATTEMPTS
        and utc_value(existing.expires_at) > now + timedelta(seconds=OTP_REUSE_MIN_SECONDS)
    ):
        return existing.code

    code = f"{secrets.randbelow(1_000_000):06d}"
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
    # Look up the challenge by email + purpose only and compare the code in constant time,
    # so every wrong guess is counted against the challenge (brute-force protection).
    challenge = db.scalar(
        select(OtpChallenge)
        .where(OtpChallenge.email == email, OtpChallenge.purpose == purpose)
        .order_by(OtpChallenge.created_at.desc())
    )
    if challenge is None:
        raise HTTPException(status_code=401, detail="Invalid code")
    if challenge.consumed_at is not None:
        raise HTTPException(status_code=409, detail="Code already used")
    if utc_value(challenge.expires_at) < utc_now():
        raise HTTPException(status_code=410, detail="Code expired")
    if challenge.failed_attempts >= OTP_MAX_FAILED_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code")
    if not hmac.compare_digest(challenge.code, code) or challenge.invite_token != invite_token:
        challenge.failed_attempts += 1
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid code")
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
        clock_mode=organization.clock_mode or "both",
        **locale_settings(organization),
    )


@router.post("/otp/send")
def send_otp(payload: OtpSendRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    user = db.scalar(select(User).where(User.email == email))

    if payload.purpose == OtpPurposeEnum.LOGIN:
        if user is None:
            raise HTTPException(status_code=404, detail="Account with this email was not found")
        title = "Sign in to Plato"
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
        subtitle = "Confirm this email to create your Plato account."
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
    send_otp_email(email=email, code=code, title=title, subtitle=subtitle, expires_in_minutes=OTP_EXPIRES_SECONDS // 60)
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
    org = Organization(name=payload.organization_name.strip(), country=payload.country)
    db.add_all([user, org])
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
            trial_ends_at=utc_now() + timedelta(days=30),
            current_period_ends_at=utc_now() + timedelta(days=30),
        )
    )
    _create_remembered_session(db, response, user, [membership])
    db.commit()
    db.refresh(user)
    return ok(_issue_auth_payload(user, [membership]))


# Password guessing: 8 wrong passwords for one email within 15 minutes locks password sign-in for it.
# In-memory per process, which is enough for one API instance; the email-code sign-in stays available.
_PASSWORD_WINDOW_SECONDS = 15 * 60
_PASSWORD_MAX_FAILURES = 8
_failed_passwords: dict[str, list[float]] = {}


def _check_password_attempts(email: str) -> None:
    now = time_module.monotonic()
    recent = [moment for moment in _failed_passwords.get(email, []) if now - moment < _PASSWORD_WINDOW_SECONDS]
    _failed_passwords[email] = recent
    if len(recent) >= _PASSWORD_MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Too many wrong passwords. Try again in 15 minutes or sign in with an email code.")


def _record_failed_password(email: str) -> None:
    _failed_passwords.setdefault(email, []).append(time_module.monotonic())


@router.post("/login")
@router.post("/login/password")
def login_with_password(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower()
    _check_password_attempts(email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(status_code=404, detail="Account with this email was not found")
    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        _record_failed_password(email)
        raise HTTPException(status_code=401, detail="Invalid password")
    _failed_passwords.pop(email, None)

    memberships = db.scalars(select(OrganizationMembership).where(OrganizationMembership.user_id == user.id)).all()
    _create_remembered_session(db, response, user, memberships)
    db.commit()
    return ok(_issue_auth_payload(user, memberships))


def _dev_login_allowed(secret: str | None) -> bool:
    if settings.dev_login_secret and secret:
        return hmac.compare_digest(secret.encode("utf-8"), settings.dev_login_secret.encode("utf-8"))
    return settings.dev_login_enabled and settings.app_env != "production"


@router.post("/dev-login")
def dev_login(response: Response, payload: DevLoginRequest | None = None, db: Session = Depends(get_db)):
    """Test login behind DEV_LOGIN_SECRET (or DEV_LOGIN_ENABLED outside production).

    `as_role="staff"` signs in as a worker of the same test business, so both sides can be tried from a phone.
    """
    if not _dev_login_allowed(payload.secret if payload else None):
        raise HTTPException(status_code=404, detail="Not Found")

    admin = dev_login_user(db)
    if admin is None:
        raise HTTPException(status_code=404, detail="No admin account to log in as")
    admin_memberships = db.scalars(select(OrganizationMembership).where(OrganizationMembership.user_id == admin.id)).all()
    admin_membership = next((item for item in admin_memberships if item.role == RoleEnum.ADMIN), admin_memberships[0] if admin_memberships else None)
    if admin_membership is not None:
        grant_comp_pro(db, admin_membership.organization_id)

    user = admin
    memberships = list(admin_memberships)
    if payload and payload.as_role == "staff":
        if admin_membership is None:
            raise HTTPException(status_code=404, detail="The test business has no workers yet")
        staff_membership = db.scalar(
            select(OrganizationMembership)
            .join(User, User.id == OrganizationMembership.user_id)
            .where(
                OrganizationMembership.organization_id == admin_membership.organization_id,
                OrganizationMembership.role == RoleEnum.STAFF,
            )
            .order_by(User.email.like("%@demo.gastrostuff.app").desc(), User.created_at)
        )
        if staff_membership is None:
            raise HTTPException(status_code=404, detail="The test business has no workers yet. Fill the demo restaurant first.")
        user = db.get(User, staff_membership.user_id)
        memberships = [staff_membership]
    elif admin_membership is not None:
        memberships = [admin_membership, *[item for item in admin_memberships if item.id != admin_membership.id]]

    _create_remembered_session(db, response, user, memberships)
    db.commit()
    return ok(_issue_auth_payload(user, memberships))


@router.post("/invites/join/accept")
def accept_invite(payload: InviteAcceptRequest, response: Response, db: Session = Depends(get_db)):
    """Join by the emailed invite link alone: the link already proves the email, so no code is needed.

    Only for a new email. An existing account must not be signed in by whoever holds a link, so it
    keeps the code flow (and managers add existing accounts directly anyway).
    """
    email = payload.email.lower()
    invite = db.scalar(select(InviteToken).where(InviteToken.token == payload.invite_token))
    if invite is None or invite.email.lower() != email:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.accepted_at is not None:
        raise HTTPException(status_code=409, detail="Invite already used")
    if utc_value(invite.expires_at) < utc_now():
        raise HTTPException(status_code=410, detail="Invite expired. Ask your manager for a new one.")
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status_code=409, detail="This email already has an account. Sign in instead.")

    user = User(email=email, full_name=payload.full_name.strip()[:120], password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    membership = OrganizationMembership(organization_id=invite.organization_id, user_id=user.id, role=invite.role, max_hours_per_week=40)
    db.add(membership)
    for location_id in db.scalars(select(Location.id).where(Location.organization_id == invite.organization_id)).all():
        db.add(LocationMembership(location_id=location_id, user_id=user.id, priority=DEFAULT_LOCATION_PRIORITY, hourly_rate_pln=0))
    db.add(
        InAppNotification(
            organization_id=invite.organization_id,
            user_id=invite.invited_by,
            type=NotificationTypeEnum.TEAM,
            title="Invite accepted",
            body=f"{user.full_name} joined your business",
            action_url="/team",
            entity_kind="user",
            entity_id=str(user.id),
        )
    )
    db.delete(invite)
    db.flush()
    _create_remembered_session(db, response, user, [membership])
    db.commit()
    return ok(_issue_auth_payload(user, [membership]))


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
        name = (payload.full_name or "").strip() or _pretty_name_from_email(email)
        user = User(email=email, full_name=name[:120], password_hash="")
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
            db.add(LocationMembership(location_id=location_id, user_id=user.id, priority=DEFAULT_LOCATION_PRIORITY, hourly_rate_pln=0))

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
    # Not being signed in is the normal state for a visitor, so answer 200 with no data instead of 401.
    session = _get_session_from_cookie(db, session_token)
    if session is None:
        if session_token:
            _clear_auth_session_cookie(response)
        return ok(None)
    user = db.get(User, session.user_id)
    if user is None:
        _clear_auth_session_cookie(response)
        return ok(None)
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
        subscription=build_subscription_summary(db, active_membership.organization_id if active_membership else None),
        is_platform_admin=user.email.lower() in settings.parsed_platform_admin_emails,
        is_demo_account=is_demo_account(db, user),
    )
    return ok(payload_out.model_dump(mode="json"))
