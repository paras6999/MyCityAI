"""Dashboard summaries (API.md §6.8): KPI cards, department table, ward heatmap, categories."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_role
from app.models import Complaint, User, Ward
from app.services import summary
from app.services.complaints import staff_scope

router = APIRouter(prefix="/staff/summary", tags=["summary"])
DB = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(require_role("officer", "ward_rep", "mayor", "admin"))]
CityWide = Annotated[User, Depends(require_role("mayor", "admin"))]


def _rows(db: Session, user: User, ward_id: int | None = None) -> list[summary.Row]:
    """Complaints this user may see (officer: department, ward rep: ward), optionally one ward."""
    stmt = staff_scope(select(Complaint), user)
    if ward_id is not None:
        stmt = stmt.where(Complaint.ward_id == ward_id)
    return summary.load(db, stmt)


@router.get("")
def kpis(db: DB, user: Staff, ward_id: int | None = None) -> dict:
    """KPI cards for the logged-in role; `escalated_to_me` is null for officers."""
    return summary.kpis(_rows(db, user, ward_id), user.role)


@router.get("/departments")
def departments(db: DB, user: Staff, ward_id: int | None = None) -> dict:
    """Department table / ranking (best resolution rate first)."""
    return {"items": summary.by_department(_rows(db, user, ward_id))}


@router.get("/wards")
def wards(db: DB, user: CityWide) -> dict:
    """Every ward with pending / resolved counts and its centre point (mayor heatmap)."""
    return {"items": summary.by_ward(_rows(db, user), list(db.scalars(select(Ward))))}


@router.get("/categories")
def categories(db: DB, user: Staff, ward_id: int | None = None) -> dict:
    return {"items": summary.by_category(_rows(db, user, ward_id))}
