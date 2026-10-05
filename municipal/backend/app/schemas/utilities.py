"""Utilities agent: sensors, readings, forecasts and AI suggestions (API.md §6.9, §12)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import AwareDatetime, Department

SensorKind = Literal["water_flow", "power_load"]


class ReadingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sensor: str = Field(min_length=1, max_length=30, description="Sensor code, e.g. W12-FLOW")
    ts: datetime = Field(description="Start of the hour the value covers (with time zone)")
    value: float = Field(ge=0)


class ReadingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readings: list[ReadingIn] = Field(min_length=1, max_length=5000)


class ReadingsResult(BaseModel):
    stored: int
    suggestions: list[int]  # ids of suggestions created or updated by these readings


class SensorOut(BaseModel):
    id: int
    code: str
    name: str
    kind: SensorKind
    unit: str
    department: Department
    ward_id: int | None
    lat: float
    lng: float
    capacity: float
    last_value: float | None
    last_ts: AwareDatetime | None
    status: Literal["normal", "anomaly", "no_data"]
    forecast_peak: float | None  # highest value expected in the next 24 h
    capacity_risk: float  # 0-1, see API.md §12


class Point(BaseModel):
    ts: AwareDatetime
    value: float


class ReadingPoint(Point):
    expected: float | None


class ForecastOut(BaseModel):
    method: Literal["lstm", "seasonal"]
    points: list[Point]


class SensorDetailOut(BaseModel):
    sensor: SensorOut
    readings: list[ReadingPoint]
    forecast: ForecastOut


class SuggestionOut(BaseModel):
    """API.md §6.9"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: str
    department: Department | None
    ward_id: int | None
    ref: dict[str, Any]
    status: Literal["open", "dismissed", "actioned"]
    created_at: AwareDatetime
    updated_at: AwareDatetime
