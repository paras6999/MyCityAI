"""Public city statistics (API.md §8). No login: citizen app "City Stats" tab and public page."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import Ward
from app.services import summary

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/public")
def public_stats(
    db: Annotated[Session, Depends(get_db)],
    period: Annotated[str | None, Query(pattern=r"^20\d\d(-(0[1-9]|1[0-2]))?$")] = None,
) -> dict:
    """Counts and rates for a year (`2026`) or month (`2026-09`). No personal data."""
    label, start, end = summary.parse_period(period)
    return summary.public_stats(summary.load(db), list(db.scalars(select(Ward))), label, start, end)
