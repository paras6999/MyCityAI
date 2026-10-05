from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _now() -> datetime:
    return datetime.now(UTC)


class Sensor(Base):
    """A water flow meter or power feeder meter for one ward (simulated in the prototype)."""

    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)  # e.g. "W12-FLOW"
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(20))  # water_flow | power_load
    unit: Mapped[str] = mapped_column(String(10))  # m3/h | kW
    department: Mapped[str] = mapped_column(String(20))
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("wards.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    # Safe maximum (pipe / feeder rating); forecasts near it raise complaint priority.
    capacity: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SensorReading(Base):
    """One hourly value (average flow or load over the hour starting at `ts`)."""

    __tablename__ = "sensor_readings"
    __table_args__ = (UniqueConstraint("sensor_id", "ts", name="uq_sensor_readings_sensor_ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    value: Mapped[float] = mapped_column(Float)


class AiSuggestion(Base):
    """Something an AI agent noticed for staff (API.md §6.9), e.g. a possible leak."""

    __tablename__ = "ai_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(30))  # anomaly | ...
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(String(20))
    ward_id: Mapped[int | None] = mapped_column(ForeignKey("wards.id"))
    # Links for the dashboard: sensor_id, complaint_id (after a work order), ...
    ref: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # Same problem → same key, so a running leak updates one suggestion instead of many.
    key: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open|dismissed|actioned
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )
