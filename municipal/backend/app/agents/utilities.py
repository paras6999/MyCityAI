"""Utilities agent: spots unusual water / power readings and turns them into suggestions.

1. Expected value per hour = seasonal estimate from earlier weeks (agents/forecast.py).
2. Residual = (actual - expected) / the sensor's average level, plus the hour of day.
3. Isolation Forest learns what normal residuals look like over the previous weeks and
   scores the latest hours. Several unusual hours in a row, all well above or below
   normal, make an anomaly: e.g. extra flow at night = possible leak or illegal connection.
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from sklearn.ensemble import IsolationForest

from app.agents.forecast import expected

RECENT_HOURS = 6  # hours checked each time
MIN_FLAGGED = 3  # unusual hours (of RECENT_HOURS) needed
MIN_DEVIATION = 0.2  # average deviation from normal (20 %)
TRAIN_DAYS = 21
MIN_HISTORY_DAYS = 8  # a week to compare with, plus a day to learn from


@dataclass(frozen=True)
class Anomaly:
    direction: str  # up | down
    deviation: float  # e.g. 0.38 = 38 % above normal
    hours: int  # unusual hours among the latest RECENT_HOURS
    since: datetime


def _hour_features(ts: datetime) -> tuple[float, float]:
    angle = 2 * math.pi * ((ts.hour + 5.5) % 24) / 24  # city time (IST)
    return math.sin(angle), math.cos(angle)


def detect(series: dict[datetime, float]) -> Anomaly | None:
    """`series`: hourly readings of one sensor (aware datetimes), at least ~8 days."""
    times = sorted(series)
    if len(times) < MIN_HISTORY_DAYS * 24:
        return None
    level = sum(series.values()) / len(series) or 1.0

    rows = []  # (ts, residual, deviation vs expected)
    for ts in times[-(TRAIN_DAYS * 24 + RECENT_HOURS) :]:
        normal = expected(series, ts)
        if normal is None:
            continue
        rows.append((ts, (series[ts] - normal) / level, series[ts] - normal, normal))
    if len(rows) < 24 + RECENT_HOURS:
        return None

    train, recent = rows[:-RECENT_HOURS], rows[-RECENT_HOURS:]
    model = IsolationForest(n_estimators=100, contamination=0.02, random_state=0)
    model.fit([[r, *_hour_features(ts)] for ts, r, _, _ in train])
    flags = model.predict([[r, *_hour_features(ts)] for ts, r, _, _ in recent])

    unusual = [row for row, flag in zip(recent, flags, strict=True) if flag == -1]
    if len(unusual) < MIN_FLAGGED:
        return None
    extra = sum(diff for _, _, diff, _ in unusual)
    normal_total = sum(normal for *_, normal in unusual) or 1.0
    deviation = extra / normal_total
    if abs(deviation) < MIN_DEVIATION:
        return None
    if any((diff > 0) != (deviation > 0) for _, _, diff, _ in unusual):
        return None  # mixed up / down: noise, not one problem
    return Anomaly(
        direction="up" if deviation > 0 else "down",
        deviation=round(deviation, 3),
        hours=len(unusual),
        since=unusual[0][0],
    )


# --- wording -----------------------------------------------------------------

# (kind, direction) -> title, complaint category for a work order
MEANING = {
    ("water_flow", "up"): ("Possible leak / illegal connection", "water_leakage"),
    ("water_flow", "down"): ("Water supply drop", "no_water_supply"),
    ("power_load", "up"): ("Overload risk", "power_outage"),
    ("power_load", "down"): ("Possible power outage", "power_outage"),
}


def describe(kind: str, code: str, ward_label: str, anomaly: Anomaly) -> tuple[str, str]:
    title, _ = MEANING[(kind, anomaly.direction)]
    what = "Flow" if kind == "water_flow" else "Load"
    side = "above" if anomaly.direction == "up" else "below"
    percent = round(abs(anomaly.deviation) * 100)
    body = (
        f"{what} {percent}% {side} normal in {anomaly.hours} of the last {RECENT_HOURS} hours "
        f"(sensor {code})."
    )
    if kind == "water_flow" and anomaly.direction == "up":
        body += " Extra flow when demand is low usually means a leak or an illegal connection."
    return f"{title} in {ward_label}", body


def capacity_risk(peak: float, capacity: float) -> float:
    """0 below 85 % of capacity, rising to 1 at full capacity."""
    if capacity <= 0:
        return 0.0
    return round(min(1.0, max(0.0, (peak / capacity - 0.85) / 0.15)), 2)


def window_start(now: datetime) -> datetime:
    """Readings needed: training days plus three earlier weeks for the expected values."""
    return now - timedelta(days=TRAIN_DAYS + 21, hours=RECENT_HOURS)
