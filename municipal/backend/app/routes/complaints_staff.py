"""Staff complaint endpoints (API.md §6.2–6.7)."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_role
from app.models import Complaint, TimelineEvent, User
from app.schemas.common import Department, ItemList, Page
from app.schemas.complaint import (
    Category,
    CommentCreate,
    ComplaintOut,
    ComplaintUpdate,
    PriorityLevel,
    Status,
    TimelineEventOut,
)
from app.schemas.user import UserOut
from app.services import complaints as service
from app.services import push
from app.services.realtime import hub

router = APIRouter(prefix="/staff", tags=["staff"])
DB = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(require_role("officer", "ward_rep", "mayor", "admin"))]
# Ward reps watch and chase; officers (and mayor/admin) change complaints.
Editor = Annotated[User, Depends(require_role("officer", "mayor", "admin"))]


@router.get("/complaints", response_model=Page[ComplaintOut])
def list_complaints(
    db: DB,
    user: Staff,
    status: Status | None = None,
    category: Category | None = None,
    department: Department | None = None,
    ward_id: int | None = None,
    priority_level: PriorityLevel | None = None,
    escalation_level: Annotated[int | None, Query(ge=0, le=2)] = None,
    sla: service.SlaFilter | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: service.SortOption = "priority",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    stmt = service.staff_scope(select(Complaint), user)
    stmt = service.apply_staff_filters(
        stmt,
        status=status,
        category=category,
        department=department,
        ward_id=ward_id,
        level=priority_level,
        escalation_level=escalation_level,
        sla=sla,
        q=q,
    )
    items, total = service.paginate(db, service.apply_sort(stmt, sort), page, page_size)
    return Page(
        items=[service.to_staff_out(c) for c in items], page=page, page_size=page_size, total=total
    )


@router.get("/complaints/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: int, db: DB, user: Staff):
    return service.to_staff_out(service.get_for_staff(db, complaint_id, user))


@router.get("/complaints/{complaint_id}/timeline", response_model=ItemList[TimelineEventOut])
def get_timeline(complaint_id: int, db: DB, user: Staff):
    complaint = service.get_for_staff(db, complaint_id, user)
    events = db.scalars(
        select(TimelineEvent)
        .where(TimelineEvent.complaint_id == complaint.id)
        .order_by(TimelineEvent.created_at, TimelineEvent.id)
    ).all()
    return ItemList(items=[TimelineEventOut.model_validate(e) for e in events])


def publish_update(complaint: Complaint, out: ComplaintOut) -> None:
    hub.publish(
        "complaint.updated",
        out.model_dump(mode="json"),
        department=complaint.department,
        ward_id=complaint.ward_id,
    )


@router.get("/complaints/{complaint_id}/duplicates", response_model=ItemList[ComplaintOut])
def get_duplicates(complaint_id: int, db: DB, user: Staff):
    """Reports merged into this complaint (API.md §6.3)."""
    complaint = service.get_for_staff(db, complaint_id, user)
    merged = db.scalars(
        select(Complaint)
        .where(Complaint.merged_into_id == complaint.id)
        .order_by(Complaint.created_at)
    )
    return ItemList(items=[service.to_staff_out(c) for c in merged])


@router.patch("/complaints/{complaint_id}", response_model=ComplaintOut)
def update_complaint(
    complaint_id: int, body: ComplaintUpdate, db: DB, user: Editor, background: BackgroundTasks
):
    complaint = service.get_for_staff(db, complaint_id, user)
    previous_department = complaint.department
    previous_status = complaint.status
    service.update_complaint(db, complaint, user, body)
    db.commit()
    db.refresh(complaint)
    out = service.to_staff_out(complaint)

    publish_update(complaint, out)
    if complaint.department != previous_department:
        # Let the old department's dashboards drop the complaint from their queue.
        hub.publish(
            "complaint.updated",
            out.model_dump(mode="json"),
            department=previous_department,
            ward_id=None,
        )
    if complaint.status != previous_status:
        notification = push.build_status_push(db, complaint, complaint.status, body.note)
        if notification:
            background.add_task(push.deliver, notification)
    return out


@router.post("/complaints/{complaint_id}/comments", response_model=ComplaintOut)
def add_comment(complaint_id: int, body: CommentCreate, db: DB, user: Staff):
    complaint = service.get_for_staff(db, complaint_id, user)
    service.add_event(db, complaint, "comment", user, note=body.note)
    db.commit()
    out = service.to_staff_out(complaint)
    publish_update(complaint, out)
    return out


@router.get("/users", response_model=ItemList[UserOut])
def list_staff(
    db: DB,
    user: Staff,
    department: Department | None = None,
    role: Annotated[str | None, Query(pattern="^(officer|ward_rep|mayor|admin)$")] = None,
):
    """Staff list for the assignment dropdown (API.md §6.7)."""
    stmt = select(User).where(User.role != "citizen", User.is_active.is_(True))
    if department:
        stmt = stmt.where(User.department == department)
    if role:
        stmt = stmt.where(User.role == role)
    return ItemList(items=[UserOut.model_validate(u) for u in db.scalars(stmt.order_by(User.name))])
