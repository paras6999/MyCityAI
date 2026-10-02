from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.user import User


def _now() -> datetime:
    return datetime.now(UTC)


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        Index("ix_complaints_department_status", "department", "status"),
        Index("ix_complaints_ward_status", "ward_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str | None] = mapped_column(String(20), unique=True)
    source: Mapped[str] = mapped_column(String(20), default="citizen_app")
    description: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(2), default="en")

    category: Mapped[str] = mapped_column(String(30))
    department: Mapped[str] = mapped_column(String(20))

    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    address: Mapped[str | None] = mapped_column(String(255))
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("wards.id"))

    # Relative to MEDIA_DIR, e.g. "complaints/4187/photo.jpg". Null for non-photo sources.
    photo_path: Mapped[str | None] = mapped_column(String(255))

    status: Mapped[str] = mapped_column(String(20), default="new")
    priority_score: Mapped[int] = mapped_column(Integer, default=50)
    # AI triage result: category_confidence, detected_objects, summary, severity,
    # sensitive_location, model ("gemini" or "keywords")
    ai: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # Text embedding of the description (Gemini), used for duplicate detection
    embedding: Mapped[list[float] | None] = mapped_column(JSON)

    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    merged_into_id: Mapped[int | None] = mapped_column(ForeignKey("complaints.id"))

    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reporter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    # Latest resolution proof: after_photo_path, note, ai_verified (True/False/None = not checked),
    # ai_confidence, reason, method, uploaded_at
    proof: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # Citizen's answer after resolution: action (confirm/reopen/auto_closed), rating, comment,
    # created_at
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sla_hours: Mapped[int] = mapped_column(Integer)
    sla_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id])
    reporter: Mapped[User | None] = relationship(foreign_keys=[reporter_id])


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id"), index=True)
    type: Mapped[str] = mapped_column(String(30))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    actor: Mapped[User | None] = relationship()
