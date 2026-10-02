from pydantic import BaseModel, ConfigDict

from app.schemas.common import AwareDatetime, Department, Language, Role


class UserOut(BaseModel):
    """API.md §3.1 User"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None
    phone: str | None
    role: Role
    department: Department | None
    ward_id: int | None
    language: Language
    created_at: AwareDatetime


class UserUpdate(BaseModel):
    """PATCH /auth/me — every field optional."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    language: Language | None = None
    ward_id: int | None = None


class WardOut(BaseModel):
    """API.md §3.2 Ward"""

    id: int
    number: int
    name: str
    rep_user_id: int | None
