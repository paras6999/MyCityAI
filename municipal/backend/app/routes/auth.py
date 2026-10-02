from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import APIError
from app.core.security import CurrentUser, decode_token, load_active_user
from app.models import Ward
from app.schemas.auth import (
    OtpRequest,
    OtpRequestResponse,
    OtpTokenResponse,
    OtpVerify,
    RefreshRequest,
    StaffLogin,
    TokenResponse,
)
from app.schemas.user import UserOut, UserUpdate
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
DB = Annotated[Session, Depends(get_db)]


@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(body: OtpRequest, db: DB):
    expires_in = auth_service.request_otp(db, body.phone)
    return OtpRequestResponse(sent=True, expires_in=expires_in)


@router.post("/otp/verify", response_model=OtpTokenResponse)
def verify_otp(body: OtpVerify, db: DB):
    return auth_service.verify_otp(db, body.phone, body.otp)


@router.post("/login", response_model=TokenResponse)
def staff_login(body: StaffLogin, db: DB):
    return auth_service.staff_login(db, body.username, body.password)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: DB):
    payload = decode_token(body.refresh_token, "refresh")
    user = load_active_user(db, int(payload["sub"]))
    return TokenResponse(**auth_service.issue_tokens(user))


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: CurrentUser, db: DB):
    changes = body.model_dump(exclude_unset=True)
    if "ward_id" in changes:
        if user.role != "citizen":
            raise APIError(403, "FORBIDDEN", "Staff wards are managed by an admin")
        if changes["ward_id"] is not None and db.get(Ward, changes["ward_id"]) is None:
            raise APIError(400, "VALIDATION_ERROR", "Ward does not exist", [{"field": "ward_id"}])
    if "language" in changes and changes["language"] is None:
        raise APIError(400, "VALIDATION_ERROR", "Language cannot be empty", [{"field": "language"}])
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
