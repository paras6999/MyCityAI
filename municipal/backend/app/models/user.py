from datetime import UTC, datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Values from shared/constants.json — keep in sync.
ROLES = ("citizen", "officer", "ward_rep", "mayor", "admin")
STAFF_ROLES = ("officer", "ward_rep", "mayor", "admin")
DEPARTMENTS = ("water", "roads", "waste", "electricity", "drainage", "health", "other")
LANGUAGES = ("en", "mr", "hi")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(_in("role", ROLES), name="role_valid"),
        CheckConstraint(
            f"department IS NULL OR {_in('department', DEPARTMENTS)}", name="dept_valid"
        ),
        CheckConstraint(_in("language", LANGUAGES), name="language_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str | None] = mapped_column(String(120))
    # Citizens log in with phone + OTP; staff log in with username + password.
    phone: Mapped[str | None] = mapped_column(String(20), unique=True)
    username: Mapped[str | None] = mapped_column(String(60), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    department: Mapped[str | None] = mapped_column(String(20))
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("wards.id"))
    language: Mapped[str] = mapped_column(String(2), default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
