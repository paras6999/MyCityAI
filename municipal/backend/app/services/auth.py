import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import APIError
from app.core.security import create_token, hash_secret, verify_secret
from app.models import OtpCode, User
from app.models.user import STAFF_ROLES
from app.schemas.auth import OtpTokenResponse, TokenResponse
from app.schemas.user import UserOut

logger = logging.getLogger(__name__)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def issue_tokens(user: User) -> dict:
    return {
        "access_token": create_token(user, "access"),
        "refresh_token": create_token(user, "refresh"),
        "expires_in": get_settings().access_token_minutes * 60,
        "user": UserOut.model_validate(user),
    }


def request_otp(db: Session, phone: str) -> int:
    """Create (or replace) the OTP for a phone number. Returns seconds until it expires."""
    settings = get_settings()
    now = datetime.now(UTC)
    existing = db.get(OtpCode, phone)
    resend_after = timedelta(seconds=settings.otp_resend_seconds)
    if existing and now - _as_utc(existing.sent_at) < resend_after:
        raise APIError(429, "RATE_LIMITED", "Please wait before requesting another OTP")

    code = settings.dev_otp if not settings.is_production else f"{secrets.randbelow(10**6):06d}"
    record = existing or OtpCode(phone=phone)
    record.code_hash = hash_secret(code)
    record.sent_at = now
    record.expires_at = now + timedelta(seconds=settings.otp_ttl_seconds)
    record.attempts = 0
    db.add(record)
    db.commit()

    # SMS sending is not part of the prototype; in development the code is fixed and logged.
    if not settings.is_production:
        logger.info("Development OTP for %s is %s", phone, code)
    return settings.otp_ttl_seconds


def verify_otp(db: Session, phone: str, otp: str) -> OtpTokenResponse:
    settings = get_settings()
    record = db.get(OtpCode, phone)
    if record is None:
        raise APIError(400, "OTP_INVALID", "Request an OTP first")
    if datetime.now(UTC) > _as_utc(record.expires_at):
        raise APIError(400, "OTP_EXPIRED", "OTP has expired, request a new one")
    if record.attempts >= settings.otp_max_attempts:
        raise APIError(429, "RATE_LIMITED", "Too many wrong attempts, request a new OTP")
    if not verify_secret(otp, record.code_hash):
        record.attempts += 1
        db.commit()
        raise APIError(400, "OTP_INVALID", "Incorrect OTP")

    db.delete(record)
    user = db.scalar(select(User).where(User.phone == phone))
    is_new_user = user is None
    if user is None:
        user = User(phone=phone, role="citizen", language="en")
        db.add(user)
    elif user.role != "citizen":
        raise APIError(403, "FORBIDDEN", "Staff accounts must sign in with username and password")
    elif not user.is_active:
        raise APIError(403, "FORBIDDEN", "This account is disabled")
    db.commit()
    db.refresh(user)
    return OtpTokenResponse(**issue_tokens(user), is_new_user=is_new_user)


def staff_login(db: Session, username: str, password: str) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == username))
    if (
        user is None
        or user.role not in STAFF_ROLES
        or not user.is_active
        or not verify_secret(password, user.password_hash)
    ):
        raise APIError(401, "INVALID_CREDENTIALS", "Wrong username or password")
    return TokenResponse(**issue_tokens(user))
