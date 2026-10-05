# Import every model here so Alembic autogenerate sees all tables.
from app.models.announcement import Announcement
from app.models.base import Base
from app.models.complaint import Complaint, TimelineEvent
from app.models.device_token import DeviceToken
from app.models.otp import OtpCode
from app.models.user import User
from app.models.utilities import AiSuggestion, Sensor, SensorReading
from app.models.ward import Ward

__all__ = [
    "AiSuggestion",
    "Announcement",
    "Base",
    "Complaint",
    "DeviceToken",
    "OtpCode",
    "Sensor",
    "SensorReading",
    "TimelineEvent",
    "User",
    "Ward",
]
