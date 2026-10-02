"""Citizen endpoints (API.md §5). The citizen-app owner may also edit this file via PR."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import limit
from app.core.db import get_db
from app.core.security import require_role
from app.models import Complaint, TimelineEvent, User, Ward
from app.schemas.common import ItemList, Language, Page
from app.schemas.complaint import Category, CitizenComplaintOut, Status, TimelineEventOut
from app.services import complaints as service
from app.services.media import read_image, save_complaint_photo

router = APIRouter(prefix="/citizen", tags=["citizen"])
DB = Annotated[Session, Depends(get_db)]
Citizen = Annotated[User, Depends(require_role("citizen"))]


@router.post("/complaints", status_code=201, response_model=CitizenComplaintOut)
async def submit_complaint(
    db: DB,
    user: Citizen,
    photo: Annotated[UploadFile, File()],
    lat: Annotated[float, Form(ge=-90, le=90)],
    lng: Annotated[float, Form(ge=-180, le=180)],
    description: Annotated[str | None, Form(max_length=limit("description_max_chars"))] = None,
    address: Annotated[str | None, Form(max_length=255)] = None,
    category: Annotated[Category | None, Form()] = None,
    language: Annotated[Language | None, Form()] = None,
):
    data, extension = await read_image(photo)
    complaint = service.create_complaint(
        db,
        reporter=user,
        # The AI classifier fills the category from Phase 4; until then "other" when not chosen.
        category=category or "other",
        lat=lat,
        lng=lng,
        description=(description or "").strip() or None,
        address=(address or "").strip() or None,
        language=language or user.language,
    )
    complaint.photo_path = save_complaint_photo(complaint.id, "photo", data, extension)
    db.commit()
    db.refresh(complaint)
    return service.to_citizen_out(complaint)


@router.get("/complaints", response_model=Page[CitizenComplaintOut])
def my_complaints(
    db: DB,
    user: Citizen,
    status: Status | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    stmt = select(Complaint).where(Complaint.reporter_id == user.id)
    if status:
        stmt = stmt.where(Complaint.status == status)
    stmt = stmt.order_by(Complaint.created_at.desc(), Complaint.id.desc())
    items, total = service.paginate(db, stmt, page, page_size)
    return Page(
        items=[service.to_citizen_out(c) for c in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/complaints/{complaint_id}", response_model=CitizenComplaintOut)
def my_complaint(complaint_id: int, db: DB, user: Citizen):
    return service.to_citizen_out(service.get_for_citizen(db, complaint_id, user))


@router.get("/complaints/{complaint_id}/timeline", response_model=ItemList[TimelineEventOut])
def my_complaint_timeline(complaint_id: int, db: DB, user: Citizen):
    complaint = service.get_for_citizen(db, complaint_id, user)
    events = db.scalars(
        select(TimelineEvent)
        .where(
            TimelineEvent.complaint_id == complaint.id,
            # Staff comments are internal notes; citizens see status changes and their notes.
            TimelineEvent.type != "comment",
        )
        .order_by(TimelineEvent.created_at, TimelineEvent.id)
    ).all()
    return ItemList(items=[TimelineEventOut.model_validate(e) for e in events])


@router.get("/home")
def home(db: DB, user: Citizen) -> dict:
    """Home screen summary (API.md §5.5). Announcements arrive in Phase 6."""
    recent = db.scalars(
        select(Complaint)
        .where(Complaint.reporter_id == user.id)
        .order_by(Complaint.created_at.desc(), Complaint.id.desc())
        .limit(3)
    ).all()
    ward = db.get(Ward, user.ward_id) if user.ward_id else None
    return {
        "open_complaints": service.count_open_for_reporter(db, user.id),
        "recent_complaints": [service.to_citizen_out(c) for c in recent],
        "announcements": [],
        "ward": {"id": ward.id, "number": ward.number, "name": ward.name} if ward else None,
    }
