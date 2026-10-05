"""Simulated ward sensors for the Utilities agent (no real meters in the prototype).

Run from municipal/backend:
    python -m app.simulate_sensors setup            # 2 sensors per ward + 35 days of history
    python -m app.simulate_sensors send             # send the latest hour like a real meter
    python -m app.simulate_sensors leak --ward 12   # simulate a leak in ward 12 (last 6 hours)
    python -m app.simulate_sensors export --out readings.csv   # data for ml/forecasting

`setup` writes to the database directly (fast, and fills any gap up to now). `send` and
`leak` go through the API (POST /sensors/readings), like real meters, so the Utilities
agent runs and dashboards get live suggestions. The backend must be running for those.
"""

import argparse
import csv
import random
import sys
from datetime import UTC, datetime

import httpx
from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Sensor, SensorReading, Ward
from app.services import sensor_sim as sim

DEFAULT_URL = "http://localhost:8000/api/v1"


def _sim(sensor: Sensor, ward_number: int) -> sim.SimSensor:
    return sim.make_sensor(sensor.kind, ward_number)


def ensure_sensors(db: Session, ward_numbers: list[int] | None = None) -> list[tuple[Sensor, int]]:
    """One water flow and one power load sensor per ward. Returns (sensor, ward number)."""
    wards = db.scalars(select(Ward).order_by(Ward.number)).all()
    result = []
    for ward in wards:
        if ward_numbers and ward.number not in ward_numbers:
            continue
        for kind, info in sim.KINDS.items():
            simulated = sim.make_sensor(kind, ward.number)
            sensor = db.scalar(select(Sensor).where(Sensor.code == simulated.code))
            if sensor is None:
                rng = random.Random(simulated.code)
                sensor = Sensor(
                    code=simulated.code,
                    name=f"{info['label']} · Ward {ward.number} {ward.name}",
                    kind=kind,
                    unit=info["unit"],
                    department=info["department"],
                    ward_id=ward.id,
                    lat=(ward.center_lat or 16.70) + rng.uniform(-0.002, 0.002),
                    lng=(ward.center_lng or 74.24) + rng.uniform(-0.002, 0.002),
                    capacity=simulated.capacity,
                )
                db.add(sensor)
                db.flush()
            result.append((sensor, ward.number))
    return result


def setup(db: Session, days: int = 35, ward_numbers: list[int] | None = None) -> int:
    """Create sensors and write normal hourly history up to the current hour. Idempotent:
    only hours after each sensor's latest reading are added. Returns readings written."""
    now = datetime.now(UTC)
    written = 0
    for sensor, number in ensure_sensors(db, ward_numbers):
        latest = db.scalar(
            select(func.max(SensorReading.ts)).where(SensorReading.sensor_id == sensor.id)
        )
        latest = latest.replace(tzinfo=UTC) if latest and latest.tzinfo is None else latest
        simulated = _sim(sensor, number)
        rows = [
            {"sensor_id": sensor.id, "ts": ts, "value": sim.normal_value(simulated, ts)}
            for ts in sim.hours_back(now, days * 24)
            if latest is None or ts > latest
        ]
        if rows:
            db.execute(insert(SensorReading), rows)
            written += len(rows)
    db.commit()
    return written


def _post(url: str, readings: list[dict]) -> dict:
    response = httpx.post(
        f"{url}/sensors/readings",
        json={"readings": readings},
        headers={"X-Sensor-Key": get_settings().sensor_api_key},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


def send(db: Session, url: str, hours: int = 1) -> dict:
    """Send the latest `hours` of normal readings for every sensor through the API."""
    now = datetime.now(UTC)
    readings = [
        {
            "sensor": sensor.code,
            "ts": ts.isoformat(),
            "value": sim.normal_value(_sim(sensor, n), ts),
        }
        for sensor, n in ensure_sensors(db)
        for ts in sim.hours_back(now, hours)
    ]
    db.commit()
    return _post(url, readings)


def leak(db: Session, url: str, ward: int, kind: str, percent: float, hours: int) -> dict:
    """Re-send the last `hours` of one ward sensor with a fault added: extra constant flow
    (leak / illegal connection, percent > 0) or a drop (percent < 0, e.g. outage)."""
    pairs = ensure_sensors(db, [ward])
    db.commit()
    match = [(s, n) for s, n in pairs if s.kind == kind]
    if not match:
        raise SystemExit(f"No ward {ward} — run `setup` first")
    sensor, number = match[0]
    simulated = _sim(sensor, number)
    now = datetime.now(UTC)
    readings = []
    for ts in sim.hours_back(now, hours):
        normal = sim.normal_value(simulated, ts)
        if percent >= 0:
            value = normal + sim.leak_extra(simulated, percent)
        else:
            value = normal * (1 + percent / 100)
        readings.append(
            {"sensor": sensor.code, "ts": ts.isoformat(), "value": round(max(0, value), 2)}
        )
    return _post(url, readings)


def export(db: Session, path: str) -> int:
    rows = db.execute(
        select(Sensor.code, Sensor.kind, SensorReading.ts, SensorReading.value)
        .join(Sensor, Sensor.id == SensorReading.sensor_id)
        .order_by(Sensor.code, SensorReading.ts)
    ).all()
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["sensor", "kind", "ts", "value"])
        for code, kind, ts, value in rows:
            ts = ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts
            writer.writerow([code, kind, ts.astimezone(UTC).isoformat(), value])
    return len(rows)


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(
        prog="python -m app.simulate_sensors", description=__doc__.split("\n")[0]
    )
    commands = parser.add_subparsers(dest="command", required=True)
    p_setup = commands.add_parser("setup", help="create sensors + history (direct to database)")
    p_setup.add_argument("--days", type=int, default=35)
    p_send = commands.add_parser("send", help="send the latest hour(s) through the API")
    p_send.add_argument("--hours", type=int, default=1)
    p_leak = commands.add_parser("leak", help="simulate a fault in one ward through the API")
    p_leak.add_argument("--ward", type=int, required=True)
    p_leak.add_argument("--kind", choices=sorted(sim.KINDS), default="water_flow")
    p_leak.add_argument("--percent", type=float, default=40, help="extra flow (negative = drop)")
    p_leak.add_argument("--hours", type=int, default=6)
    p_export = commands.add_parser("export", help="CSV for ml/forecasting/train_lstm.py")
    p_export.add_argument("--out", default="readings.csv")
    for sub in (p_send, p_leak):
        sub.add_argument("--url", default=DEFAULT_URL, help="backend API base URL")
    args = parser.parse_args(argv)

    with SessionLocal() as db:
        if args.command == "setup":
            print(f"Sensors ready; {setup(db, args.days)} readings written.")
        elif args.command == "send":
            print(send(db, args.url, args.hours))
        elif args.command == "leak":
            print(leak(db, args.url, args.ward, args.kind, args.percent, args.hours))
        else:
            print(f"{export(db, args.out)} readings written to {args.out}")


if __name__ == "__main__":
    main(sys.argv[1:])
