from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserOut

PHONE_PATTERN = r"^\+[1-9]\d{9,14}$"


class OtpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str = Field(pattern=PHONE_PATTERN, examples=["+919876543210"])


class OtpRequestResponse(BaseModel):
    sent: bool
    expires_in: int


class OtpVerify(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str = Field(pattern=PHONE_PATTERN)
    otp: str = Field(pattern=r"^\d{6}$")


class StaffLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class OtpTokenResponse(TokenResponse):
    is_new_user: bool


class DeviceTokenIn(BaseModel):
    """POST/DELETE /auth/device-token — Expo push token of the citizen's phone."""

    model_config = ConfigDict(extra="forbid")

    token: str = Field(pattern=r"^Expo(nent)?PushToken\[.+\]$", max_length=255)
    platform: Literal["android", "ios"] = "android"
