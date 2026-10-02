from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import APIError
from app.models import User

JWT_ALGORITHM = "HS256"
TokenType = Literal["access", "refresh"]

_bearer = HTTPBearer(auto_error=False)


def hash_secret(secret: str) -> str:
    """bcrypt hash for passwords and OTP codes."""
    return bcrypt.hashpw(secret.encode(), bcrypt.gensalt()).decode()


def verify_secret(secret: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(secret.encode(), hashed.encode())


def create_token(user: User, token_type: TokenType) -> str:
    settings = get_settings()
    lifetime = (
        timedelta(minutes=settings.access_token_minutes)
        if token_type == "access"
        else timedelta(days=settings.refresh_token_days)
    )
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "department": user.department,
        "ward_id": user.ward_id,
        "type": token_type,
        "exp": datetime.now(UTC) + lifetime,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> dict:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise APIError(401, "TOKEN_EXPIRED", "Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise APIError(401, "UNAUTHORIZED", "Invalid token") from exc
    if payload.get("type") != expected_type:
        raise APIError(401, "UNAUTHORIZED", "Wrong token type")
    return payload


def load_active_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise APIError(401, "UNAUTHORIZED", "User not found or disabled")
    return user


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise APIError(401, "UNAUTHORIZED", "Missing bearer token")
    payload = decode_token(credentials.credentials, "access")
    return load_active_user(db, int(payload["sub"]))


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: str) -> Callable[[User], User]:
    """Route dependency: `user: User = Depends(require_role("officer", "mayor"))`."""

    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise APIError(403, "FORBIDDEN", "Your role cannot do this")
        return user

    return checker
