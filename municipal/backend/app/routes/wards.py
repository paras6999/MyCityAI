from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import User, Ward
from app.schemas.user import WardOut

router = APIRouter(prefix="/wards", tags=["wards"])


@router.get("")
def list_wards(db: Annotated[Session, Depends(get_db)]) -> dict[str, list[WardOut]]:
    """Public list of wards (citizen app ward picker, dashboard filters)."""
    reps = dict(
        db.execute(
            select(User.ward_id, User.id).where(User.role == "ward_rep", User.is_active.is_(True))
        ).all()
    )
    wards = db.scalars(select(Ward).order_by(Ward.number)).all()
    return {
        "items": [
            WardOut(id=w.id, number=w.number, name=w.name, rep_user_id=reps.get(w.id))
            for w in wards
        ]
    }
