"""Simulated ward sensors (prototype stand-in for real IoT meters, PRD AI-6).

Values are deterministic: the same sensor and hour always give the same "normal" reading,
so history, live ticks and an injected leak all agree with each other.

Water flow (m³/h): morning and evening supply peaks, low at night.
Power load (kW): evening peak, moderate daytime, lower on Sundays.
"""

import hashlib
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

KINDS = {
    "water_flow": {"unit": "m3/h", "department": "water", "suffix": "FLOW", "label": "Water flow"},
    "power_load": {
        "unit": "kW",
        "department": "electricity",
        "suffix": "LOAD",
        "label": "Power load",
    },
}

# Share of the ward's base level at each hour of the day (city time).
WATER_PROFILE = [
    0.25, 0.22, 0.22, 0.25, 0.4, 0.85, 1.35, 1.5, 1.3, 1.0, 0.8, 0.75,
    0.8, 0.75, 0.7, 0.75, 0.9, 1.15, 1.4, 1.45, 1.2, 0.85, 0.55, 0.35,
]  # fmt: skip
POWER_PROFILE = [
    0.5, 0.45, 0.42, 0.42, 0.45, 0.55, 0.7, 0.85, 0.95, 1.0, 1.05, 1.1,
    1.1, 1.05, 1.0, 1.0, 1.05, 1.15, 1.35, 1.5, 1.5, 1.35, 1.0, 0.7,
]  # fmt: skip
PROFILES = {"water_flow": WATER_PROFILE, "power_load": POWER_PROFILE}
NOISE = 0.05  # ±5 % hour-to-hour variation


@dataclass(frozen=True)
class SimSensor:
    code: str
    kind: str
    ward_number: int
    base: float  # average level

    @property
    def capacity(self) -> float:
        """Rating 35 % above the normal daily peak: Sundays and seasonal drift stay well
        below it, so only unusual demand gets near capacity."""
        return round(self.base * max(PROFILES[self.kind]) * 1.35, 1)


def sensor_code(kind: str, ward_number: int) -> str:
    prefix = "W" if kind == "water_flow" else "P"
    return f"{prefix}{ward_number}-{KINDS[kind]['suffix']}"


def make_sensor(kind: str, ward_number: int) -> SimSensor:
    rng = random.Random(f"{kind}-{ward_number}")
    base = rng.uniform(80, 200) if kind == "water_flow" else rng.uniform(800, 2500)
    return SimSensor(sensor_code(kind, ward_number), kind, ward_number, round(base, 1))


def _noise(code: str, ts: datetime) -> float:
    seed = hashlib.sha256(f"{code}|{ts.isoformat()}".encode()).digest()
    return random.Random(seed).gauss(0, NOISE)


def hour_floor(value: datetime) -> datetime:
    return value.replace(minute=0, second=0, microsecond=0)


def normal_value(sensor: SimSensor, ts: datetime) -> float:
    """Normal reading for the hour starting at `ts` (aware datetime)."""
    local = ts.astimezone(IST)
    level = PROFILES[sensor.kind][local.hour]
    if local.weekday() == 6:  # Sunday: offices closed, people at home
        level *= 1.08 if sensor.kind == "water_flow" else 0.85
    # Slow seasonal drift (±4 % over ~2 months) so forecasts have a trend to follow.
    drift = 1 + 0.04 * math.sin(ts.timestamp() / (86400 * 60) * 2 * math.pi)
    return round(max(0.0, sensor.base * level * drift * (1 + _noise(sensor.code, ts))), 2)


def leak_extra(sensor: SimSensor, percent: float) -> float:
    """A leak / illegal connection adds a constant flow, so it stands out most at night."""
    return round(sensor.base * percent / 100, 2)


def hours_back(end: datetime, hours: int) -> list[datetime]:
    end = hour_floor(end)
    return [end - timedelta(hours=h) for h in range(hours - 1, -1, -1)]
