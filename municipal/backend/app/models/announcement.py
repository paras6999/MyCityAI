from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.user import User


def _now() -> datetime:
    return datetime.now(UTC)


class Announcement(Base):
    """Ward / department / city notice for citizens (API.md §3.9)."""

    __tablename__ = "announcements"
    __table_args__ = (
        Index("ix_announcements_status_valid", "status", "valid_from", "valid_until"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # {"en": ..., "mr": ..., "hi": ...}; mr / hi may be null until translated
    title: Mapped[dict[str, Any]] = mapped_column(JSON)
    message: Mapped[dict[str, Any]] = mapped_column(JSON)
    priority: Mapped[str] = mapped_column(String(20))  # emergency | important | general
    department: Mapped[str | None] = mapped_column(String(20))
    ward_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    city_wide: Mapped[bool] = mapped_column(Boolean, default=False)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    # staff | police_bridge | system
    source: Mapped[str] = mapped_column(String(20), default="staff")
    ai_drafted: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="published")  # draft | published
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # {"rule": "daily" | "weekly", "days": ["mon", ...], "time": "06:00"} — shown as a schedule
    recurrence: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # While active, new complaints in these categories from the covered wards get an auto-reply
    linked_categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    author: Mapped[User | None] = relationship()
