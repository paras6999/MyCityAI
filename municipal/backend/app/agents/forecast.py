"""Demand forecast for the Utilities agent: next 24 h of water flow / power load per sensor.

Two methods, chosen automatically:
- "lstm": TorchScript model trained by ml/forecasting/train_lstm.py, listed in
  ml/forecasting/models.json and copied to MODELS_DIR. Needs PyTorch (requirements-ml.txt).
- "seasonal": average of the same hour in previous weeks (fallback, and the baseline the
  LSTM is measured against). Also gives the "expected" value used for anomaly detection.
"""

import hashlib
import json
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[4]
REGISTRY = _REPO_ROOT / "ml" / "forecasting" / "models.json"
HORIZON = 24
WEEK = 168


@dataclass
class Forecast:
    method: str  # lstm | seasonal
    points: list[tuple[datetime, float]]

    @property
    def peak(self) -> float:
        return max((v for _, v in self.points), default=0.0)


def expected(series: dict[datetime, float], ts: datetime, weeks: int = 3) -> float | None:
    """Seasonal estimate for `ts` from earlier data only: same hour of week in up to `weeks`
    previous weeks, else the same hour on the previous 7 days."""
    same_week_hour = [
        series[t] for k in range(1, weeks + 1) if (t := ts - timedelta(weeks=k)) in series
    ]
    if same_week_hour:
        return sum(same_week_hour) / len(same_week_hour)
    same_hour = [series[t] for k in range(1, 8) if (t := ts - timedelta(days=k)) in series]
    return sum(same_hour) / len(same_hour) if same_hour else None


def seasonal_forecast(series: dict[datetime, float], last: datetime) -> Forecast:
    points = []
    extended = dict(series)
    for h in range(1, HORIZON + 1):
        ts = last + timedelta(hours=h)
        value = expected(extended, ts) or 0.0
        extended[ts] = value  # lets the daily fallback roll forward
        points.append((ts, round(value, 2)))
    return Forecast("seasonal", points)


# --- LSTM ---------------------------------------------------------------------


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


@lru_cache
def _load_lstm() -> tuple[Any, dict] | None:
    """(TorchScript module, registry entry), or None when unavailable."""
    if not get_settings().forecast_lstm_enabled or not REGISTRY.exists():
        return None
    entries = json.loads(REGISTRY.read_text(encoding="utf-8")).get("models", [])
    if not entries:
        return None
    entry = entries[0]
    path = Path(get_settings().models_dir) / entry["file"]
    if not path.exists():
        logger.info("Forecast model %s not found; using seasonal forecast", path)
        return None
    if entry.get("sha256") and _sha256(path) != entry["sha256"]:
        logger.warning("Forecast model %s has the wrong checksum; ignoring it", path)
        return None
    metrics = entry.get("test_metrics", {})
    lstm_error = metrics.get("lstm", {}).get("mape")
    seasonal_error = metrics.get("seasonal", {}).get("mape")
    if lstm_error is None or seasonal_error is None or lstm_error >= seasonal_error:
        logger.info(
            "Forecast model %s (MAPE %s%%) does not beat seasonal (%s%%); not using it",
            entry["name"],
            lstm_error,
            seasonal_error,
        )
        return None
    try:
        import torch  # optional dependency
    except ImportError:
        logger.info("PyTorch not installed; using seasonal forecast")
        return None
    model = torch.jit.load(str(path), map_location="cpu")
    model.eval()
    logger.info("Loaded forecast model %s", entry["name"])
    return model, entry


def _features(values: list[float], times: list[datetime], scale: float) -> list[list[float]]:
    # Same features as ml/forecasting/train_lstm.py: scaled value + hour of day (city time).
    rows = []
    for value, ts in zip(values, times, strict=True):
        hour = (ts.hour + 5.5) % 24  # IST
        angle = 2 * math.pi * hour / 24
        rows.append([value / scale, math.sin(angle), math.cos(angle)])
    return rows


def lstm_forecast(series: dict[datetime, float], last: datetime) -> Forecast | None:
    loaded = _load_lstm()
    if loaded is None:
        return None
    model, entry = loaded
    lookback = entry.get("lookback_hours", WEEK)
    times = [last - timedelta(hours=h) for h in range(lookback - 1, -1, -1)]
    if any(t not in series for t in times):
        return None  # gaps: the model needs a full window
    values = [series[t] for t in times]
    scale = sum(values) / len(values) or 1.0
    # Hybrid model: seasonal forecast + LSTM correction (ml/forecasting/train_lstm.py).
    base = [value / scale for _, value in seasonal_forecast(series, last).points]
    import torch

    with torch.no_grad():
        x = torch.tensor([_features(values, times, scale)], dtype=torch.float32)
        y = model(x, torch.tensor([base], dtype=torch.float32))[0].tolist()
    points = [
        (last + timedelta(hours=h + 1), round(max(0.0, v * scale), 2))
        for h, v in enumerate(y[:HORIZON])
    ]
    return Forecast("lstm", points)


def forecast(series: dict[datetime, float]) -> Forecast:
    """Next 24 h after the latest reading in `series` (hourly, aware datetimes)."""
    if not series:
        return Forecast("seasonal", [])
    last = max(series)
    try:
        result = lstm_forecast(series, last)
    except Exception:
        logger.exception("LSTM forecast failed; using seasonal forecast")
        result = None
    return result or seasonal_forecast(series, last)


def preload() -> None:
    _load_lstm()
