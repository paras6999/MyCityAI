# Import every model here so Alembic autogenerate sees all tables.
from app.models.base import Base
from app.models.complaint import Complaint, TimelineEvent
from app.models.otp import OtpCode
from app.models.user import User
from app.models.ward import Ward

__all__ = ["Base", "Complaint", "OtpCode", "TimelineEvent", "User", "Ward"]
