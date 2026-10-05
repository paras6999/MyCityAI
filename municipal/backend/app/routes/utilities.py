"""Utilities agent endpoints (API.md §6.9 AI suggestions, §12 sensors)."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import APIError
from app.core.security import require_role
from app.models import AiSuggestion, Sensor, User
from app.schemas.common import ItemList
from app.schemas.complaint import ComplaintOut
from app.schemas.utilities import (
    ReadingsIn,
    ReadingsResult,
    SensorDetailOut,
    SensorKind,
    SensorOut,
    SuggestionOut,
)
from app.services import complaints as complaint_service
from app.services import utilities as service
from app.services.realtime import hub

router = APIRouter(tags=["utilities"])
DB = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(require_role("officer", "ward_rep", "mayor", "admin"))]
Actor = Annotated[User, Depends(require_role("officer", "mayor", "admin"))]


def _publish_suggestion(suggestion: AiSuggestion) -> None:
    hub.publish(
        "suggestion.created",
        service.suggestion_out(suggestion).model_dump(mode="json"),
        department=suggestion.department,
        ward_id=suggestion.ward_id,
    )


# --- sensors (machine to machine) ---------------------------------------------


@router.post("/sensors/readings", response_model=ReadingsResult)
def receive_readings(
    body: ReadingsIn,
    db: DB,
    x_sensor_key: Annotated[str | None, Header()] = None,
):
    """Hourly values from the ward meters (simulated: `python -m app.simulate_sensors`).
    The Utilities agent checks every sensor that got data and raises suggestions."""
    if not x_sensor_key or not hmac.compare_digest(x_sensor_key, get_settings().sensor_api_key):
        raise APIError(401, "INVALID_SENSOR_KEY", "Missing or wrong X-Sensor-Key")
    sensors = service.store_readings(db, body.readings)
    suggestions = [s for sensor in sensors if (s := service.analyse(db, sensor))]
    db.commit()
    for suggestion in suggestions:
        db.refresh(suggestion)
        _publish_suggestion(suggestion)
    return ReadingsResult(stored=len(body.readings), suggestions=[s.id for s in suggestions])


# --- staff: sensors -----------------------------------------------------------


@router.get("/staff/utilities/sensors", response_model=ItemList[SensorOut])
def list_sensors(db: DB, user: Staff, kind: SensorKind | None = None, ward_id: int | None = None):
    stmt = service.scope(select(Sensor), Sensor, user)
    if kind:
        stmt = stmt.where(Sensor.kind == kind)
    if ward_id is not None:
        stmt = stmt.where(Sensor.ward_id == ward_id)
    sensors = db.scalars(stmt.order_by(Sensor.kind, Sensor.code)).all()
    return ItemList(items=[service.sensor_out(db, s) for s in sensors])


@router.get("/staff/utilities/sensors/{sensor_id}", response_model=SensorDetailOut)
def sensor_detail(
    sensor_id: int, db: DB, user: Staff, hours: Annotated[int, Query(ge=24, le=24 * 21)] = 168
):
    """Readings with the expected (normal) value per hour, plus the next 24 h forecast."""
    return service.sensor_detail(db, service.get_sensor(db, sensor_id, user), hours)


# --- staff: AI suggestions ----------------------------------------------------


@router.get("/staff/ai-suggestions", response_model=ItemList[SuggestionOut])
def list_suggestions(db: DB, user: Staff, status: str = "open"):
    stmt = service.scope(select(AiSuggestion), AiSuggestion, user)
    if status != "all":
        stmt = stmt.where(AiSuggestion.status == status)
    items = db.scalars(stmt.order_by(AiSuggestion.updated_at.desc()).limit(50)).all()
    return ItemList(items=[service.suggestion_out(s) for s in items])


@router.post("/staff/ai-suggestions/{suggestion_id}/dismiss", status_code=204)
def dismiss_suggestion(suggestion_id: int, db: DB, user: Staff):
    service.dismiss(service.get_suggestion(db, suggestion_id, user))
    db.commit()
    return Response(status_code=204)


@router.post(
    "/staff/ai-suggestions/{suggestion_id}/work-order", status_code=201, response_model=ComplaintOut
)
def create_work_order(suggestion_id: int, db: DB, user: Actor):
    """Turn a sensor anomaly into a complaint (`source: "sensor"`) in the department queue."""
    suggestion = service.get_suggestion(db, suggestion_id, user)
    complaint = service.create_work_order(db, suggestion, user)
    db.commit()
    db.refresh(complaint)
    out = complaint_service.to_staff_out(complaint)
    hub.publish(
        "complaint.created",
        out.model_dump(mode="json"),
        department=complaint.department,
        ward_id=complaint.ward_id,
    )
    return out
