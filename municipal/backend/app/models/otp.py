from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OtpCode(Base):
    """Latest OTP sent to a phone number. Only a hash of the code is stored."""

    __tablename__ = "otp_codes"

    phone: Mapped[str] = mapped_column(String(20), primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
