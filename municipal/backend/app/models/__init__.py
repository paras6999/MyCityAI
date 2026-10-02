# Import every model here so Alembic autogenerate sees all tables.
from app.models.base import Base
from app.models.otp import OtpCode
from app.models.user import User
from app.models.ward import Ward

__all__ = ["Base", "OtpCode", "User", "Ward"]
