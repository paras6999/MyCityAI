"""Sensors, readings, AI suggestions and forecast risk (API.md §6.9, §12)."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.agents import forecast as forecaster
from app.agents import utilities as agent
from app.agents.fallback import DEFAULT_SEVERITY
from app.agents.priority import compute_priority
from app.core.errors import APIError
from app.models import AiSuggestion, Complaint, Sensor, SensorReading, User, Ward
from app.schemas.utilities import (
    ForecastOut,
    Point,
    ReadingIn,
    ReadingPoint,
    SensorDetailOut,
    SensorOut,
    SuggestionOut,
)
from app.services import complaints as complaint_service

UTILITY_DEPARTMENTS = ("water", "electricity")


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _hour(value: datetime) -> datetime:
    return _aware(value).astimezone(UTC).replace(minute=0, second=0, microsecond=0)


# --- scope -------------------------------------------------------------------


def scope(stmt: Select, model, user: User) -> Select:
    """Officer: own department · ward rep: own ward · mayor / admin: everything."""
    if user.role == "officer":
        return stmt.where(model.department == user.department)
    if user.role == "ward_rep":
        return stmt.where(model.ward_id == user.ward_id)
    return stmt


def get_sensor(db: Session, sensor_id: int, user: User) -> Sensor:
    sensor = db.scalar(scope(select(Sensor).where(Sensor.id == sensor_id), Sensor, user))
    if sensor is None:
        raise APIError(404, "SENSOR_NOT_FOUND", f"Sensor {sensor_id} not found")
    return sensor


def get_suggestion(db: Session, suggestion_id: int, user: User) -> AiSuggestion:
    stmt = select(AiSuggestion).where(AiSuggestion.id == suggestion_id)
    suggestion = db.scalar(scope(stmt, AiSuggestion, user))
    if suggestion is None:
        raise APIError(404, "SUGGESTION_NOT_FOUND", f"Suggestion {suggestion_id} not found")
    return suggestion


# --- readings ----------------------------------------------------------------


def series(db: Session, sensor: Sensor, since: datetime) -> dict[datetime, float]:
    rows = db.execute(
        select(SensorReading.ts, SensorReading.value)
        .where(SensorReading.sensor_id == sensor.id, SensorReading.ts >= since)
        .order_by(SensorReading.ts)
    ).all()
    return {_hour(ts): value for ts, value in rows}


def store_readings(db: Session, readings: list[ReadingIn]) -> list[Sensor]:
    """Insert or overwrite hourly values. Returns the sensors that got data. Caller commits."""
    codes = {r.sensor for r in readings}
    sensors = {s.code: s for s in db.scalars(select(Sensor).where(Sensor.code.in_(codes)))}
    unknown = sorted(codes - sensors.keys())
    if unknown:
        raise APIError(
            400, "UNKNOWN_SENSOR", f"Unknown sensor code(s): {', '.join(unknown)}",
            [{"field": "sensor", "value": code} for code in unknown],
        )  # fmt: skip
    touched: dict[int, Sensor] = {}
    for reading in readings:
        sensor = sensors[reading.sensor]
        ts = _hour(reading.ts)
        existing = db.scalar(
            select(SensorReading).where(
                SensorReading.sensor_id == sensor.id, SensorReading.ts == ts
            )
        )
        if existing:
            existing.value = reading.value
        else:
            db.add(SensorReading(sensor_id=sensor.id, ts=ts, value=reading.value))
        touched[sensor.id] = sensor
    db.flush()
    return list(touched.values())


# --- anomalies → suggestions --------------------------------------------------


def _ward_label(db: Session, ward_id: int | None) -> str:
    ward = db.get(Ward, ward_id) if ward_id else None
    return f"Ward {ward.number} ({ward.name})" if ward else "the city"


def analyse(db: Session, sensor: Sensor) -> AiSuggestion | None:
    """Run anomaly detection for one sensor; create or refresh its suggestion. Caller commits."""
    data = series(db, sensor, agent.window_start(_now()))
    anomaly = agent.detect(data)
    if anomaly is None:
        return None
    key = f"anomaly:{sensor.code}:{anomaly.direction}"
    title, body = agent.describe(sensor.kind, sensor.code, _ward_label(db, sensor.ward_id), anomaly)
    suggestion = db.scalar(
        select(AiSuggestion).where(AiSuggestion.key == key, AiSuggestion.status == "open")
    )
    if suggestion is None:
        suggestion = AiSuggestion(
            type="anomaly",
            key=key,
            department=sensor.department,
            ward_id=sensor.ward_id,
            ref={"sensor_id": sensor.id, "ward_id": sensor.ward_id},
            title=title,
            body=body,
        )
        db.add(suggestion)
    else:  # still going: update the numbers
        suggestion.title, suggestion.body = title, body
        suggestion.updated_at = _now()
    suggestion.ref = {
        **(suggestion.ref or {}),
        "direction": anomaly.direction,
        "deviation": anomaly.deviation,
        "since": anomaly.since.isoformat(),
    }
    db.flush()
    return suggestion


def dismiss(suggestion: AiSuggestion) -> None:
    suggestion.status = "dismissed"
    suggestion.updated_at = _now()


def create_work_order(db: Session, suggestion: AiSuggestion, user: User) -> Complaint:
    """Turn an anomaly into a `sensor` complaint for the department's queue. Caller commits."""
    if suggestion.status != "open":
        raise APIError(409, "SUGGESTION_CLOSED", "This suggestion was already handled")
    sensor = db.get(Sensor, (suggestion.ref or {}).get("sensor_id"))
    if suggestion.type != "anomaly" or sensor is None:
        raise APIError(400, "NO_WORK_ORDER", "Only sensor anomalies can become work orders")
    _, category = agent.MEANING[(sensor.kind, suggestion.ref.get("direction", "up"))]
    complaint = complaint_service.create_complaint(
        db,
        reporter=None,
        category=category,
        lat=sensor.lat,
        lng=sensor.lng,
        description=f"{suggestion.title}. {suggestion.body}",
        address=f"Sensor {sensor.code}",
        source="sensor",
        priority=compute_priority(severity=DEFAULT_SEVERITY.get(category, 50), forecast_risk=1.0),
        ai={
            "model": "utilities",
            "summary": suggestion.title,
            "severity": DEFAULT_SEVERITY.get(category, 50),
            "forecast_risk": 1.0,
        },
    )
    complaint_service.add_event(
        db, complaint, "comment", user, note=f"Work order from AI suggestion #{suggestion.id}"
    )
    suggestion.status = "actioned"
    suggestion.ref = {**suggestion.ref, "complaint_id": complaint.id}
    suggestion.updated_at = _now()
    return complaint


# --- forecast risk for complaint priority --------------------------------------


def _sensor_forecast(db: Session, sensor: Sensor) -> forecaster.Forecast:
    return forecaster.forecast(series(db, sensor, _now() - timedelta(days=22)))


def risk_for(db: Session, department: str, ward_id: int | None) -> float:
    """0-1 risk used as the forecast boost in the priority score (API.md §3.4):
    1 while an anomaly is open for that ward and department, else how close tomorrow's
    forecast peak comes to the sensor's capacity."""
    if department not in UTILITY_DEPARTMENTS or ward_id is None:
        return 0.0
    open_anomaly = db.scalar(
        select(AiSuggestion.id).where(
            AiSuggestion.type == "anomaly",
            AiSuggestion.status == "open",
            AiSuggestion.department == department,
            AiSuggestion.ward_id == ward_id,
        )
    )
    if open_anomaly:
        return 1.0
    sensors = db.scalars(
        select(Sensor).where(Sensor.department == department, Sensor.ward_id == ward_id)
    ).all()
    return max(
        (agent.capacity_risk(_sensor_forecast(db, s).peak, s.capacity) for s in sensors),
        default=0.0,
    )


# --- output ------------------------------------------------------------------


def sensor_out(db: Session, sensor: Sensor, data: dict[datetime, float] | None = None) -> SensorOut:
    data = data if data is not None else series(db, sensor, _now() - timedelta(days=22))
    last_ts = max(data) if data else None
    prediction = forecaster.forecast(data) if data else None
    anomaly = db.scalar(
        select(AiSuggestion.id).where(
            AiSuggestion.type == "anomaly",
            AiSuggestion.status == "open",
            AiSuggestion.key.startswith(f"anomaly:{sensor.code}:"),
        )
    )
    peak = prediction.peak if prediction and prediction.points else None
    return SensorOut(
        id=sensor.id,
        code=sensor.code,
        name=sensor.name,
        kind=sensor.kind,
        unit=sensor.unit,
        department=sensor.department,
        ward_id=sensor.ward_id,
        lat=sensor.lat,
        lng=sensor.lng,
        capacity=sensor.capacity,
        last_value=data[last_ts] if last_ts else None,
        last_ts=last_ts,
        status="no_data" if not data else "anomaly" if anomaly else "normal",
        forecast_peak=round(peak, 2) if peak is not None else None,
        capacity_risk=agent.capacity_risk(peak, sensor.capacity) if peak is not None else 0.0,
    )


def sensor_detail(db: Session, sensor: Sensor, hours: int) -> SensorDetailOut:
    data = series(db, sensor, _now() - timedelta(days=22, hours=hours))
    cutoff = _now() - timedelta(hours=hours)
    prediction = forecaster.forecast(data)
    return SensorDetailOut(
        sensor=sensor_out(db, sensor, data),
        readings=[
            ReadingPoint(ts=ts, value=value, expected=_round(forecaster.expected(data, ts)))
            for ts, value in sorted(data.items())
            if ts >= cutoff
        ],
        forecast=ForecastOut(
            method=prediction.method,
            points=[Point(ts=ts, value=value) for ts, value in prediction.points],
        ),
    )


def _round(value: float | None) -> float | None:
    return round(value, 2) if value is not None else None


def suggestion_out(suggestion: AiSuggestion) -> SuggestionOut:
    return SuggestionOut.model_validate(suggestion)
