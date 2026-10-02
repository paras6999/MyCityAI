"""Local YOLO object detection on complaint photos (free, offline).

Models are listed in ml/vision/models.json (owned by the ML team). Each entry maps the
model's class labels to our categories, so a placeholder model can be swapped for the
team's own trained model without code changes — see docs/ML.md.

Ultralytics/PyTorch are optional (requirements-ml.txt). Without them, or without model
files, `detect()` returns None and the pipeline falls back to Gemini / keywords.
"""

import hashlib
import json
import logging
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

from app.agents.fallback import DEFAULT_SEVERITY
from app.core.config import get_settings

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT_REGISTRY = _REPO_ROOT / "ml" / "vision" / "models.json"
# Bigger potholes / piles look more serious: boost severity when an object fills the photo.
LARGE_OBJECT_AREA = 0.10
_predict_lock = threading.Lock()  # YOLO models are not safe to call from several threads


@dataclass(frozen=True)
class Detection:
    category: str
    label: str  # the model's own class name
    confidence: float
    box: list[float]  # [x1, y1, x2, y2], normalised 0-1
    model: str

    def to_json(self) -> dict[str, Any]:
        return {
            "label": self.category,
            "confidence": round(self.confidence, 2),
            "box": [round(v, 3) for v in self.box],
        }


@dataclass
class _LoadedModel:
    name: str
    yolo: Any
    labels: dict[str, str]
    min_confidence: float


def _registry_path() -> Path:
    return Path(get_settings().vision_models_file or _DEFAULT_REGISTRY)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ensure_weights(entry: dict[str, Any]) -> Path | None:
    """Local path of the model file, downloading it once if a URL is given."""
    target = Path(get_settings().models_dir) / entry["file"]
    if not target.exists():
        url = entry.get("download_url")
        if not url:
            logger.warning("Vision model %s missing at %s", entry["name"], target)
            return None
        logger.info("Downloading vision model %s from %s", entry["name"], url)
        target.parent.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", url, follow_redirects=True, timeout=120) as response:
            response.raise_for_status()
            with target.open("wb") as file:
                for chunk in response.iter_bytes():
                    file.write(chunk)
    expected = entry.get("sha256")
    if expected and _sha256(target) != expected:
        logger.error("Checksum mismatch for %s; refusing to load %s", entry["name"], target)
        return None
    return target


@lru_cache
def _load_models() -> list[_LoadedModel]:
    if not get_settings().vision_enabled:
        return []
    try:
        from ultralytics import YOLO  # optional heavy dependency
    except ImportError:
        logger.info("ultralytics not installed; photo detection disabled (requirements-ml.txt)")
        return []
    try:
        entries = json.loads(_registry_path().read_text(encoding="utf-8"))["models"]
    except (OSError, ValueError, KeyError):
        logger.exception("Cannot read vision model registry %s", _registry_path())
        return []

    loaded = []
    for entry in entries:
        try:
            weights = _ensure_weights(entry)
            if weights is None:
                continue
            loaded.append(
                _LoadedModel(
                    name=entry["name"],
                    yolo=YOLO(str(weights)),
                    labels=entry["labels"],
                    min_confidence=float(entry.get("min_confidence", 0.4)),
                )
            )
            logger.info("Loaded vision model %s", entry["name"])
        except Exception:
            logger.exception("Failed to load vision model %s", entry.get("name"))
    return loaded


def preload() -> None:
    """Load (and warm up) models in the background so the first complaint isn't slow."""

    def warm() -> None:
        import numpy as np

        for model in _load_models():
            with _predict_lock:
                model.yolo.predict(np.zeros((64, 64, 3), dtype=np.uint8), verbose=False)

    threading.Thread(target=warm, name="vision-preload", daemon=True).start()


def detect(image: bytes) -> list[Detection] | None:
    """Objects in the photo that map to a complaint category; None if vision is unavailable."""
    models = _load_models()
    if not models:
        return None
    import cv2
    import numpy as np

    picture = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
    if picture is None:
        logger.warning("Could not decode complaint photo for detection")
        return None

    detections: list[Detection] = []
    for model in models:
        try:
            with _predict_lock:
                result = model.yolo.predict(picture, conf=model.min_confidence, verbose=False)[0]
        except Exception:
            logger.exception("Vision model %s failed", model.name)
            continue
        for box in result.boxes:
            label = str(result.names[int(box.cls)])
            category = model.labels.get(label)
            if category:
                detections.append(
                    Detection(
                        category=category,
                        label=label,
                        confidence=float(box.conf),
                        box=[float(v) for v in box.xyxyn[0].tolist()],
                        model=model.name,
                    )
                )
    return sorted(detections, key=lambda d: d.confidence, reverse=True)


def best_category(detections: list[Detection]) -> tuple[str, float] | None:
    """Category with the most confident detection."""
    if not detections:
        return None
    top = detections[0]
    return top.category, top.confidence


def severity_from(category: str, detections: list[Detection]) -> int:
    """Category default severity, raised for several or large objects of that category."""
    matching = [d for d in detections if d.category == category]
    severity = DEFAULT_SEVERITY.get(category, 50)
    severity += min(15, 5 * max(0, len(matching) - 1))
    if any((d.box[2] - d.box[0]) * (d.box[3] - d.box[1]) >= LARGE_OBJECT_AREA for d in matching):
        severity += 10
    return min(100, severity)
