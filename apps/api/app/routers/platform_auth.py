"""Sign-in to the platform admin panel, separate from the business account.

1. An email code to an address in PLATFORM_ADMIN_EMAILS.
2. A code from an authenticator app. The first sign-in shows a QR code to set the app up.
3. A one-hour admin session. Ordinary sign-in tokens are never accepted by /platform.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, Header, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.envelope import ok
from app.db import get_db
from app.models import PlatformAdminCredential, PlatformAuditLog, User
from app.services import totp
from app.services.auth_email import send_otp_email

router = APIRouter(prefix="/platform/auth", tags=["platform"])

SESSION_MINUTES = 60
TICKET_MINUTES = 10
EMAIL_CODE_MINUTES = 10
EMAIL_RESEND_SECONDS = 30
MAX_FAILURES = 5
LOCK_MINUTES = 15
SESSION_SCOPE = "platform"
TICKET_SCOPE = "platform_ticket"


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _fernet() -> Fernet:
    key = hashlib.sha256(f"platform-totp:{settings.secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _seal(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def _open(sealed: str) -> str:
    try:
        return _fernet().decrypt(sealed.encode()).decode()
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail="Authenticator secret can't be read; reset it") from exc


def _hash_code(email: str, code: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _is_admin_email(email: str) -> bool:
    return email.lower() in settings.parsed_platform_admin_emails


def _credential(db: Session, email: str) -> PlatformAdminCredential:
    credential = db.scalar(select(PlatformAdminCredential).where(PlatformAdminCredential.email == email))
    if credential is None:
        credential = PlatformAdminCredential(email=email)
        db.add(credential)
        db.flush()
    return credential


def _check_lock(credential: PlatformAdminCredential) -> None:
    locked = _aware(credential.locked_until)
    if locked is not None and locked > _now():
        raise HTTPException(status_code=429, detail="Too many wrong codes. Try again in 15 minutes.")


def _fail(db: Session, credential: PlatformAdminCredential, detail: str) -> HTTPException:
    credential.failed_attempts += 1
    if credential.failed_attempts >= MAX_FAILURES:
        credential.failed_attempts = 0
        credential.locked_until = _now() + timedelta(minutes=LOCK_MINUTES)
        credential.email_code_hash = None
    db.commit()
    return HTTPException(status_code=401, detail=detail)


def _encode(payload: dict, minutes: int) -> str:
    return jwt.encode({**payload, "exp": _now() + timedelta(minutes=minutes)}, settings.secret_key, algorithm=settings.algorithm)


def _decode(token: str, scope: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Admin session expired. Sign in again.") from exc
    if payload.get("scope") != scope:
        raise HTTPException(status_code=401, detail="Admin session required")
    return payload


def _admin_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def require_platform_admin(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    """A valid admin session from /platform/auth. A normal Platofy sign-in token is refused."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Admin session required")
    payload = _decode(authorization[7:].strip(), SESSION_SCOPE)
    try:
        user = db.get(User, UUID(str(payload.get("sub"))))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Admin session required") from exc
    if user is None or not _is_admin_email(user.email):
        raise HTTPException(status_code=403, detail="Platform admin access required")
    credential = db.scalar(select(PlatformAdminCredential).where(PlatformAdminCredential.email == user.email.lower()))
    if credential is None or credential.totp_secret is None or payload.get("sv") != credential.session_version:
        raise HTTPException(status_code=401, detail="Admin session expired. Sign in again.")
    return user


class StartIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class VerifyEmailIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=6, max_length=6)


class TotpIn(BaseModel):
    ticket: str
    code: str = Field(min_length=6, max_length=8)


@router.post("/start")
def start(payload: StartIn, db: Session = Depends(get_db)):
    """Email a sign-in code. Answers the same for any address, so it doesn't reveal who is an admin."""
    email = payload.email.strip().lower()
    if _is_admin_email(email) and _admin_user(db, email) is not None:
        credential = _credential(db, email)
        _check_lock(credential)
        sent = _aware(credential.email_code_sent_at)
        # Wait a little before replacing a code that hasn't been used yet.
        if credential.email_code_hash and sent is not None and sent > _now() - timedelta(seconds=EMAIL_RESEND_SECONDS):
            raise HTTPException(status_code=429, detail="Please wait before requesting another code")
        code = f"{secrets.randbelow(1_000_000):06d}"
        credential.email_code_hash = _hash_code(email, code)
        credential.email_code_expires_at = _now() + timedelta(minutes=EMAIL_CODE_MINUTES)
        credential.email_code_sent_at = _now()
        db.commit()
        send_otp_email(
            email=email,
            code=code,
            title="Platofy admin sign-in",
            subtitle="Someone is signing in to the Platofy admin panel. If it wasn't you, ignore this email.",
            expires_in_minutes=EMAIL_CODE_MINUTES,
        )
    return ok({"sent": True})


@router.post("/verify-email")
def verify_email(payload: VerifyEmailIn, db: Session = Depends(get_db)):
    """Check the email code; the answer says whether to set up the authenticator app or enter its code."""
    email = payload.email.strip().lower()
    credential = db.scalar(select(PlatformAdminCredential).where(PlatformAdminCredential.email == email))
    user = _admin_user(db, email) if _is_admin_email(email) else None
    if credential is None or user is None:
        raise HTTPException(status_code=401, detail="Invalid code")
    _check_lock(credential)
    if credential.email_code_hash is None:
        raise HTTPException(status_code=401, detail="Invalid code")
    expires = _aware(credential.email_code_expires_at)
    if expires is None or expires < _now():
        raise HTTPException(status_code=410, detail="Code expired")
    if not hmac.compare_digest(credential.email_code_hash, _hash_code(email, payload.code.strip())):
        raise _fail(db, credential, "Invalid code")

    credential.email_code_hash = None
    credential.failed_attempts = 0
    ticket = _encode({"sub": str(user.id), "scope": TICKET_SCOPE}, TICKET_MINUTES)
    if credential.totp_secret is not None:
        db.commit()
        return ok({"next": "totp", "ticket": ticket})

    secret = totp.new_secret()
    credential.totp_pending = _seal(secret)
    db.commit()
    return ok({"next": "setup", "ticket": ticket, "secret": secret, "otpauth_uri": totp.provisioning_uri(secret, email)})


@router.post("/verify-totp")
def verify_totp(payload: TotpIn, db: Session = Depends(get_db)):
    ticket = _decode(payload.ticket, TICKET_SCOPE)
    user = db.get(User, UUID(str(ticket.get("sub"))))
    if user is None or not _is_admin_email(user.email):
        raise HTTPException(status_code=403, detail="Platform admin access required")
    credential = db.scalar(select(PlatformAdminCredential).where(PlatformAdminCredential.email == user.email.lower()))
    if credential is None:
        raise HTTPException(status_code=401, detail="Start again")
    _check_lock(credential)

    setting_up = credential.totp_secret is None
    sealed = credential.totp_pending if setting_up else credential.totp_secret
    if sealed is None:
        raise HTTPException(status_code=401, detail="Start again")
    step = totp.matching_step(_open(sealed), payload.code, after_step=credential.totp_last_step)
    if step is None:
        raise _fail(db, credential, "Wrong authenticator code")

    if setting_up:
        credential.totp_secret = credential.totp_pending
        credential.totp_pending = None
    credential.totp_last_step = step
    credential.failed_attempts = 0
    db.add(
        PlatformAuditLog(
            actor_email=user.email,
            organization_id=None,
            organization_name="—",
            action="admin_setup_2fa" if setting_up else "admin_sign_in",
            detail="",
        )
    )
    db.commit()
    token = _encode({"sub": str(user.id), "scope": SESSION_SCOPE, "sv": credential.session_version}, SESSION_MINUTES)
    return ok({"token": token, "expires_in_seconds": SESSION_MINUTES * 60, "email": user.email})


@router.post("/logout")
def logout(user: User = Depends(require_platform_admin), db: Session = Depends(get_db)):
    """Ends every admin session of this person."""
    credential = db.scalar(select(PlatformAdminCredential).where(PlatformAdminCredential.email == user.email.lower()))
    if credential is not None:
        credential.session_version += 1
        db.commit()
    return ok({"logged_out": True})


@router.get("/me")
def admin_me(user: User = Depends(require_platform_admin)):
    return ok({"email": user.email, "name": user.full_name})
