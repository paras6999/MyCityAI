"""Enums and limits from shared/constants.json — the single source shared with the apps."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings

# municipal/backend/app/core/constants.py → repo root is four levels up
_DEFAULT_PATH = Path(__file__).resolve().parents[4] / "shared" / "constants.json"


@lru_cache
def load_constants() -> dict[str, Any]:
    path = Path(get_settings().constants_path or _DEFAULT_PATH)
    return json.loads(path.read_text(encoding="utf-8"))


def category_info(category: str) -> dict[str, Any]:
    """{"department": ..., "sla_hours": ...} for a category."""
    return load_constants()["categories"][category]


def allowed_transitions(status: str) -> list[str]:
    return load_constants()["status_transitions"][status]


def priority_level(score: int) -> str:
    for level, bounds in load_constants()["priority_levels"].items():
        if bounds["min"] <= score <= bounds["max"]:
            return level
    return "medium"


def limit(name: str) -> int:
    return load_constants()["limits"][name]
