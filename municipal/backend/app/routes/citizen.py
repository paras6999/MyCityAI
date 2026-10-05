"""Citizen endpoints (API.md §5). The citizen-app owner may also edit this file via PR."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.duplicates import nearby_open_complaints
from app.agents.orchestrator import run_triage
from app.core.constants import limit, priority_level
from app.core.db import get_db
from app.core.security import require_role
from app.models import Complaint, TimelineEvent, User, Ward
from app.schemas.common import ItemList, Language, Page
from app.schemas.complaint import (
    AnalyzeOut,
    Category,
    CitizenComplaintOut,
    DuplicateHint,
    FeedbackIn,
    Status,
    TimelineEventOut,
)
from app.services import announcements, live_photo
from app.services import complaints as service
from app.services.media import mime_for, read_image, save_complaint_photo
from app.services.realtime import hub

router = APIRouter(prefix="/citizen", tags=["citizen"])
DB = Annotated[Session, Depends(get_db)]
Citizen = Annotated[User, Depends(require_role("citizen"))]


def _clean(text: str | None) -> str | None:
    return (text or "").strip() or None


# How the app says the photo was taken (API.md §5.2 "Live photo rules")
CapturedAt = Annotated[datetime | None, Form()]
Accuracy = Annotated[float | None, Form(ge=0)]
CaptureSource = Annotated[Literal["camera", "gallery"] | None, Form()]


@router.post("/complaints/analyze", response_model=AnalyzeOut)
def analyze_photo(
    db: DB,
    user: Citizen,
    photo: Annotated[UploadFile, File()],
    lat: Annotated[float, Form(ge=-90, le=90)],
    lng: Annotated[float, Form(ge=-180, le=180)],
    description: Annotated[str | None, Form(max_length=limit("description_max_chars"))] = None,
    captured_at: CapturedAt = None,
    location_accuracy_m: Accuracy = None,
    capture_source: CaptureSource = None,
):
    """Preview before submitting: AI category, priority, nearby duplicates and whether the photo
    passes the live-photo rules. Saves nothing."""
    data, extension = read_image(photo)
    check = live_photo.check_live_photo(
        data,
        lat=lat,
        lng=lng,
        captured_at=captured_at,
        accuracy_m=location_accuracy_m,
        capture_source=capture_source,
    )
    triage = run_triage(
        db,
        image=data,
        mime_type=mime_for(extension),
        description=_clean(description),
        lat=lat,
        lng=lng,
    )
    nearby = nearby_open_complaints(db, triage.category, lat, lng)
    explained = announcements.explaining(
        db, triage.category, service.nearest_ward_id(db, lat, lng) or user.ward_id
    )
    return AnalyzeOut(
        suggested_category=triage.category,
        department=triage.department,
        confidence=round(triage.confidence, 2),
        priority_level=priority_level(triage.priority),
        summary=triage.summary,
        is_civic_issue=triage.is_civic_issue,
        photo_check=check.to_json(),
        detections=[d.to_json() for d in triage.detections],
        nearby_duplicates=[
            DuplicateHint(
                id=c.complaint.id,
                code=c.complaint.code,
                category=c.complaint.category,
                distance_m=round(c.distance_m, 1),
                status=c.complaint.status,
            )
            for c in nearby[:5]
        ],
        active_announcement=(
            announcements.to_out(explained).model_dump(mode="json") if explained else None
        ),
    )


@router.post("/complaints", status_code=201, response_model=CitizenComplaintOut)
def submit_complaint(
    db: DB,
    user: Citizen,
    photo: Annotated[UploadFile, File()],
    lat: Annotated[float, Form(ge=-90, le=90)],
    lng: Annotated[float, Form(ge=-180, le=180)],
    description: Annotated[str | None, Form(max_length=limit("description_max_chars"))] = None,
    address: Annotated[str | None, Form(max_length=255)] = None,
    category: Annotated[Category | None, Form()] = None,
    language: Annotated[Language | None, Form()] = None,
    captured_at: CapturedAt = None,
    location_accuracy_m: Accuracy = None,
    capture_source: CaptureSource = None,
):
    data, extension = read_image(photo)
    check = live_photo.check_live_photo(
        data,
        lat=lat,
        lng=lng,
        captured_at=captured_at,
        accuracy_m=location_accuracy_m,
        capture_source=capture_source,
    )
    live_photo.enforce(check)
    description = _clean(description)
    triage = run_triage(
        db,
        image=data,
        mime_type=mime_for(extension),
        description=description,
        lat=lat,
        lng=lng,
        chosen_category=category,
    )
    complaint = service.create_complaint(
        db,
        reporter=user,
        category=triage.category,
        lat=lat,
        lng=lng,
        description=description,
        address=_clean(address),
        language=language or user.language,
        priority=triage.priority,
        ai=triage.ai_info,
        embedding=triage.embedding,
    )
    complaint.photo_meta = check.to_json()
    # Stored and served without EXIF (exact GPS, phone model): privacy.
    stored = live_photo.strip_metadata(data, extension)
    complaint.photo_path = save_complaint_photo(complaint.id, "photo", stored, extension)

    original = db.get(Complaint, triage.duplicate_id) if triage.duplicate_id else None
    if original is not None:
        service.merge_into(db, complaint, original)
    else:
        # e.g. "no water" during an announced shutdown: tell the citizen right away.
        explained = announcements.explaining(db, complaint.category, complaint.ward_id)
        if explained is not None:
            language = complaint.language
            note = (
                f"{announcements.text_in(explained.title, language)}: "
                f"{announcements.text_in(explained.message, language)}"
            )
            service.add_event(db, complaint, "auto_reply", note=note)
    db.commit()
    db.refresh(complaint)

    if original is not None:
        db.refresh(original)
        hub.publish(
            "complaint.updated",
            service.to_staff_out(original).model_dump(mode="json"),
            department=original.department,
            ward_id=original.ward_id,
        )
    else:
        hub.publish(
            "complaint.created",
            service.to_staff_out(complaint).model_dump(mode="json"),
            department=complaint.department,
            ward_id=complaint.ward_id,
        )
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
            # Staff comments and reminders are internal; citizens see status changes and notes.
            TimelineEvent.type.not_in(("comment", "reminder")),
        )
        .order_by(TimelineEvent.created_at, TimelineEvent.id)
    ).all()
    return ItemList(items=[TimelineEventOut.model_validate(e) for e in events])


@router.post("/complaints/{complaint_id}/feedback", response_model=CitizenComplaintOut)
def give_feedback(complaint_id: int, body: FeedbackIn, db: DB, user: Citizen):
    """Confirm the fix (closes the complaint) or reopen it with a reason (API.md §5.4)."""
    complaint = service.get_for_citizen(db, complaint_id, user)
    service.apply_feedback(db, complaint, user, body.action, body.rating, body.comment)
    db.commit()
    db.refresh(complaint)
    hub.publish(
        "complaint.feedback",
        service.to_staff_out(complaint).model_dump(mode="json"),
        department=complaint.department,
        ward_id=complaint.ward_id,
    )
    return service.to_citizen_out(complaint)


@router.get("/home")
def home(db: DB, user: Citizen) -> dict:
    """Home screen summary (API.md §5.5)."""
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
        "announcements": [
            announcements.to_out(a).model_dump(mode="json")
            for a in announcements.for_ward(db, user.ward_id)[:5]
        ],
        "ward": {"id": ward.id, "number": ward.number, "name": ward.name} if ward else None,
    }
