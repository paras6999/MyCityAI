"""Announcement schemas — field names match docs/API.md §3.9 and §7."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import AwareDatetime, Department, Role
from app.schemas.complaint import Category

Priority = Literal["emergency", "important", "general"]
Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class Localized(BaseModel):
    """Text in English plus Marathi / Hindi (null until translated)."""

    en: str
    mr: str | None = None
    hi: str | None = None


class Recurrence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule: Literal["daily", "weekly"]
    days: list[Weekday] = []
    time: str = Field(pattern=r"^\d{2}:\d{2}$", examples=["06:00"])


class AuthorRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None
    role: Role


class AnnouncementOut(BaseModel):
    """API.md §3.9"""

    id: int
    title: Localized
    message: Localized
    priority: Priority
    department: Department | None
    ward_ids: list[int]
    city_wide: bool
    author: AuthorRef | None
    source: Literal["staff", "police_bridge", "system"]
    ai_drafted: bool
    status: Literal["draft", "published"]
    valid_from: AwareDatetime
    valid_until: AwareDatetime | None
    recurrence: Recurrence | None
    linked_categories: list[Category]
    created_at: AwareDatetime
    published_at: AwareDatetime | None


class _Targeting(BaseModel):
    """Who an announcement is for — shared by create and draft."""

    model_config = ConfigDict(extra="forbid")

    priority: Priority = "general"
    department: Department | None = None
    ward_ids: list[int] = []
    city_wide: bool = False
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    recurrence: Recurrence | None = None
    linked_categories: list[Category] = []

    @model_validator(mode="after")
    def _check(self):
        if not self.city_wide and not self.ward_ids:
            raise ValueError("Choose at least one ward or make it city-wide")
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("valid_until must be after valid_from")
        return self


class AnnouncementCreate(_Targeting):
    """POST /announcements"""

    title_en: str = Field(min_length=3, max_length=120)
    message_en: str = Field(min_length=3, max_length=1000)
    auto_translate: bool = True


class AnnouncementDraftRequest(_Targeting):
    """POST /announcements/draft — AI turns a rough note into an announcement (not yet public)."""

    text: str = Field(min_length=3, max_length=1000)


class AnnouncementUpdate(BaseModel):
    """PATCH /announcements/{id} — every field optional; targeting is checked again."""

    model_config = ConfigDict(extra="forbid")

    title: Localized | None = None
    message: Localized | None = None
    priority: Priority | None = None
    ward_ids: list[int] | None = None
    city_wide: bool | None = None
    valid_from: AwareDatetime | None = None
    valid_until: AwareDatetime | None = None
    recurrence: Recurrence | None = None
    linked_categories: list[Category] | None = None
