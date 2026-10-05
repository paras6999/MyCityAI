"""Complaint business rules: creation, visibility, status transitions, timeline."""

import math
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.agents.fallback import DEFAULT_SEVERITY
from app.agents.priority import compute_priority
from app.core.constants import allowed_transitions, category_info, load_constants, priority_level
from app.core.errors import APIError
from app.models import Complaint, TimelineEvent, User, Ward
from app.schemas.complaint import (
    AiInfo,
    CitizenAiInfo,
    CitizenAssignee,
    CitizenComplaintOut,
    ComplaintOut,
    ComplaintUpdate,
    FeedbackOut,
    Location,
    PersonRef,
    ProofOut,
    ReporterRef,
)
from app.services.media import media_url

# Used only when a complaint is created without AI triage (e.g. demo seed data).
DEFAULT_PRIORITY = 50
DUE_SOON_HOURS = 12
# Statuses where the SLA clock no longer matters.
SLA_STOPPED = ("resolved", "closed", "rejected", "merged")
# Re-routing to another department is only allowed before work starts.
REROUTABLE = ("new", "assigned", "reopened")

SortOption = Literal["priority", "created_at", "sla_due_at"]
SlaFilter = Literal["overdue", "due_soon"]


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


# --- creation ----------------------------------------------------------------


def nearest_ward_id(db: Session, lat: float, lng: float) -> int | None:
    """Ward whose centre point is closest (prototype stand-in for real ward boundaries)."""
    wards = db.execute(
        select(Ward.id, Ward.center_lat, Ward.center_lng).where(Ward.center_lat.is_not(None))
    ).all()
    if not wards:
        return None
    scale = math.cos(math.radians(lat))  # longitude degrees shrink away from the equator
    return min(
        wards, key=lambda w: (w.center_lat - lat) ** 2 + ((w.center_lng - lng) * scale) ** 2
    ).id


def add_event(
    db: Session,
    complaint: Complaint,
    event_type: str,
    actor: User | None = None,
    *,
    from_status: str | None = None,
    to_status: str | None = None,
    note: str | None = None,
) -> None:
    db.add(
        TimelineEvent(
            complaint_id=complaint.id,
            type=event_type,
            from_status=from_status,
            to_status=to_status,
            note=note,
            actor_id=actor.id if actor else None,
            created_at=_now(),
        )
    )


def create_complaint(
    db: Session,
    *,
    reporter: User | None,
    category: str,
    lat: float,
    lng: float,
    description: str | None = None,
    address: str | None = None,
    language: str = "en",
    source: str = "citizen_app",
    created_at: datetime | None = None,
    priority: int = DEFAULT_PRIORITY,
    ai: dict | None = None,
    embedding: list[float] | None = None,
) -> Complaint:
    """Create a complaint with its code, SLA, ward and first timeline event. Caller commits."""
    info = category_info(category)
    created = created_at or _now()
    complaint = Complaint(
        source=source,
        description=description,
        language=language,
        category=category,
        department=info["department"],
        lat=lat,
        lng=lng,
        address=address,
        ward_id=nearest_ward_id(db, lat, lng) or (reporter.ward_id if reporter else None),
        status="new",
        priority_score=priority,
        ai=ai,
        embedding=embedding,
        reporter_id=reporter.id if reporter else None,
        sla_hours=info["sla_hours"],
        sla_due_at=created + timedelta(hours=info["sla_hours"]),
        created_at=created,
        updated_at=created,
    )
    db.add(complaint)
    db.flush()  # assigns the id used in the code
    complaint.code = f"KMC-{created.year}-{complaint.id:05d}"
    add_event(db, complaint, "created", reporter, to_status="new")
    if ai and ai.get("model"):
        note = f"AI: {category} ({round(100 * (ai.get('category_confidence') or 0))}% confident)"
        add_event(db, complaint, "classified", note=note)
    return complaint


def rescore(complaint: Complaint) -> None:
    """Recompute priority after duplicates or waiting time change."""
    ai = complaint.ai or {}
    created, due = _aware(complaint.created_at), _aware(complaint.sla_due_at)
    window = (due - created).total_seconds() or 1
    complaint.priority_score = compute_priority(
        severity=ai.get("severity") or DEFAULT_SEVERITY.get(complaint.category, 50),
        duplicate_count=complaint.duplicate_count,
        sensitive_location=bool(ai.get("sensitive_location")),
        sla_elapsed_fraction=(_now() - created).total_seconds() / window,
    )


def merge_into(db: Session, duplicate: Complaint, original: Complaint) -> None:
    """Mark `duplicate` as another report of `original` and raise the original's priority."""
    duplicate.status = "merged"
    duplicate.merged_into_id = original.id
    add_event(db, duplicate, "merged", to_status="merged", note=f"Same issue as {original.code}")
    original.duplicate_count += 1
    rescore(original)
    original.updated_at = _now()
    add_event(
        db,
        original,
        "merged",
        note=f"Another citizen reported this ({duplicate.code}). "
        f"Reports: {original.duplicate_count + 1}",
    )


# --- visibility & listing ----------------------------------------------------


def staff_scope(stmt: Select, user: User) -> Select:
    """Restrict a complaint query to what this staff member may see (API.md §6.1)."""
    if user.role == "officer":
        return stmt.where(Complaint.department == user.department)
    if user.role == "ward_rep":
        return stmt.where(Complaint.ward_id == user.ward_id)
    return stmt


def get_for_staff(db: Session, complaint_id: int, user: User) -> Complaint:
    stmt = staff_scope(select(Complaint).where(Complaint.id == complaint_id), user)
    complaint = db.scalar(stmt)
    if complaint is None:
        raise APIError(404, "COMPLAINT_NOT_FOUND", f"Complaint {complaint_id} not found")
    return complaint


def get_for_citizen(db: Session, complaint_id: int, user: User) -> Complaint:
    """The citizen's own complaint, or an original their report was merged into."""
    complaint = db.get(Complaint, complaint_id)
    if complaint is not None and complaint.reporter_id != user.id:
        merged_report = db.scalar(
            select(Complaint.id).where(
                Complaint.merged_into_id == complaint.id, Complaint.reporter_id == user.id
            )
        )
        if merged_report is None:
            complaint = None
    if complaint is None:
        raise APIError(404, "COMPLAINT_NOT_FOUND", f"Complaint {complaint_id} not found")
    return complaint


def apply_staff_filters(
    stmt: Select,
    *,
    status: str | None = None,
    category: str | None = None,
    department: str | None = None,
    ward_id: int | None = None,
    level: str | None = None,
    escalation_level: int | None = None,
    escalated: bool | None = None,
    sla: SlaFilter | None = None,
    q: str | None = None,
) -> Select:
    if status:
        stmt = stmt.where(Complaint.status == status)
    else:
        # Merged reports live under their original (GET .../duplicates), not in the queue.
        stmt = stmt.where(Complaint.status != "merged")
    if category:
        stmt = stmt.where(Complaint.category == category)
    if department:
        stmt = stmt.where(Complaint.department == department)
    if ward_id is not None:
        stmt = stmt.where(Complaint.ward_id == ward_id)
    if level:
        bounds = load_constants()["priority_levels"][level]
        stmt = stmt.where(Complaint.priority_score.between(bounds["min"], bounds["max"]))
    if escalation_level is not None:
        stmt = stmt.where(Complaint.escalation_level == escalation_level)
    if escalated:
        # Escalation inbox: still open and above officer level.
        stmt = stmt.where(Complaint.escalation_level >= 1, Complaint.status.not_in(SLA_STOPPED))
    if sla:
        now = _now()
        stmt = stmt.where(Complaint.status.not_in(SLA_STOPPED))
        if sla == "overdue":
            stmt = stmt.where(Complaint.sla_due_at < now)
        else:
            stmt = stmt.where(
                Complaint.sla_due_at.between(now, now + timedelta(hours=DUE_SOON_HOURS))
            )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Complaint.code.ilike(pattern),
                Complaint.description.ilike(pattern),
                Complaint.address.ilike(pattern),
            )
        )
    return stmt


def apply_sort(stmt: Select, sort: SortOption) -> Select:
    if sort == "created_at":
        return stmt.order_by(Complaint.created_at.desc(), Complaint.id.desc())
    if sort == "sla_due_at":
        return stmt.order_by(Complaint.sla_due_at.asc(), Complaint.id)
    return stmt.order_by(Complaint.priority_score.desc(), Complaint.created_at.asc())


def count_open_for_reporter(db: Session, reporter_id: int) -> int:
    stmt = select(func.count(Complaint.id)).where(
        Complaint.reporter_id == reporter_id,
        Complaint.status.not_in(("closed", "rejected", "merged")),
    )
    return db.scalar(stmt) or 0


def paginate(db: Session, stmt: Select, page: int, page_size: int) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return list(items), total


# --- updates -----------------------------------------------------------------


def _transition(db: Session, complaint: Complaint, actor: User, target: str, note: str | None):
    previous = complaint.status
    complaint.status = target
    add_event(
        db, complaint, "status_changed", actor, from_status=previous, to_status=target, note=note
    )


def _validate_assignee(db: Session, complaint: Complaint, assignee_id: int) -> User:
    assignee = db.get(User, assignee_id)
    if (
        assignee is None
        or not assignee.is_active
        or assignee.role != "officer"
        or assignee.department != complaint.department
    ):
        raise APIError(
            400,
            "VALIDATION_ERROR",
            "Assignee must be an active officer of the complaint's department",
            [{"field": "assigned_to_id", "message": "invalid assignee"}],
        )
    return assignee


def update_complaint(db: Session, complaint: Complaint, actor: User, body: ComplaintUpdate) -> None:
    """Apply PATCH /staff/complaints/{id}. Raises APIError on rule violations; caller commits."""
    changes = body.model_dump(exclude_unset=True)
    note = changes.pop("note", None)
    acted = False

    # 1. Re-route (category / department)
    if changes.get("category") or changes.get("department"):
        if complaint.status not in REROUTABLE:
            raise APIError(
                409, "INVALID_STATUS_TRANSITION", "Cannot re-route after work has started"
            )
        category = changes.get("category") or complaint.category
        department = changes.get("department") or category_info(category)["department"]
        if (category, department) != (complaint.category, complaint.department):
            moved = department != complaint.department
            complaint.category = category
            complaint.department = department
            add_event(
                db, complaint, "classified", actor, note=f"Re-routed to {category} / {department}"
            )
            if moved:
                complaint.assigned_to_id = None
                if complaint.status == "assigned":
                    _transition(db, complaint, actor, "new", "Moved to another department")
            acted = True

    # 2. Assignment
    if "assigned_to_id" in changes:
        assignee_id = changes["assigned_to_id"]
        if assignee_id is None:
            complaint.assigned_to_id = None
            add_event(db, complaint, "assigned", actor, note="Unassigned")
        elif assignee_id != complaint.assigned_to_id:
            assignee = _validate_assignee(db, complaint, assignee_id)
            complaint.assigned_to_id = assignee.id
            add_event(db, complaint, "assigned", actor, note=f"Assigned to {assignee.name}")
            if complaint.status in ("new", "reopened") and "status" not in changes:
                _transition(db, complaint, actor, "assigned", None)
        acted = True

    # 3. Status
    target = changes.get("status")
    if target and target != complaint.status:
        if target == "resolved":
            raise APIError(
                409,
                "INVALID_STATUS_TRANSITION",
                "Upload an after-photo to resolve (proof endpoint)",
            )
        if target in ("closed", "reopened", "merged"):
            raise APIError(409, "INVALID_STATUS_TRANSITION", f"Staff cannot set status '{target}'")
        if target not in allowed_transitions(complaint.status):
            raise APIError(
                409,
                "INVALID_STATUS_TRANSITION",
                f"Cannot change status from '{complaint.status}' to '{target}'",
            )
        if target == "rejected" and not note:
            raise APIError(
                400, "VALIDATION_ERROR", "A reason is required to reject", [{"field": "note"}]
            )
        if target == "assigned" and complaint.assigned_to_id is None:
            raise APIError(
                400, "VALIDATION_ERROR", "Choose who to assign", [{"field": "assigned_to_id"}]
            )
        _transition(db, complaint, actor, target, note)
        note = None  # already stored on the status event
        acted = True

    if note:
        add_event(db, complaint, "comment", actor, note=note)
        acted = True
    if acted:
        complaint.updated_at = _now()


# --- resolution & feedback ---------------------------------------------------

AUTO_CLOSE_NOTE = "Closed automatically: no response from the citizen within 72 hours"


def record_proof(
    db: Session,
    complaint: Complaint,
    actor: User,
    *,
    photo_path: str,
    note: str | None,
    verification,
) -> None:
    """Store the latest proof; resolve unless the AI found the problem still there."""
    now = _now()
    complaint.proof = {
        "after_photo_path": photo_path,
        "note": note,
        "ai_verified": verification.ai_verified,
        "ai_confidence": verification.confidence,
        "reason": verification.reason,
        "method": verification.method,
        "uploaded_at": now.isoformat(),
    }
    add_event(db, complaint, "proof_uploaded", actor, note=note)
    if verification.outcome == "not_fixed":
        add_event(db, complaint, "comment", note=f"AI check: not fixed - {verification.reason}")
    else:
        if verification.outcome == "verified":
            add_event(db, complaint, "proof_verified", note=verification.reason)
        _transition(db, complaint, actor, "resolved", verification.reason)
        complaint.resolved_at = now
    complaint.updated_at = now


def apply_feedback(
    db: Session,
    complaint: Complaint,
    citizen: User,
    action: str,
    rating: int | None,
    comment: str | None,
) -> None:
    if complaint.reporter_id != citizen.id:
        raise APIError(
            403, "FORBIDDEN", "Only the citizen who reported this can confirm or reopen it"
        )
    if complaint.status != "resolved":
        raise APIError(
            409, "INVALID_STATUS_TRANSITION", "Feedback is only possible after resolution"
        )
    comment = (comment or "").strip() or None
    if action == "reopen" and not comment:
        raise APIError(
            400, "VALIDATION_ERROR", "Tell us what is still wrong", [{"field": "comment"}]
        )
    now = _now()
    complaint.feedback = {
        "action": action,
        "rating": rating,
        "comment": comment,
        "created_at": now.isoformat(),
    }
    if action == "confirm":
        add_event(db, complaint, "feedback", citizen, note=comment)
        _transition(db, complaint, citizen, "closed", None)
    else:
        complaint.status = "reopened"
        complaint.resolved_at = None
        add_event(
            db,
            complaint,
            "reopened",
            citizen,
            from_status="resolved",
            to_status="reopened",
            note=comment,
        )
    complaint.updated_at = now


def close_stale_resolved(db: Session, hours: int) -> list[Complaint]:
    """Close complaints resolved more than `hours` ago without citizen feedback. Caller commits."""
    cutoff = _now() - timedelta(hours=hours)
    stale = list(
        db.scalars(
            select(Complaint).where(Complaint.status == "resolved", Complaint.resolved_at < cutoff)
        )
    )
    for complaint in stale:
        complaint.feedback = {
            "action": "auto_closed",
            "rating": None,
            "comment": None,
            "created_at": _now().isoformat(),
        }
        complaint.status = "closed"
        complaint.updated_at = _now()
        add_event(
            db,
            complaint,
            "status_changed",
            from_status="resolved",
            to_status="closed",
            note=AUTO_CLOSE_NOTE,
        )
    return stale


def _proof_out(c: Complaint) -> ProofOut | None:
    if not c.proof:
        return None
    return ProofOut(
        after_photo_url=media_url(c.proof.get("after_photo_path")),
        note=c.proof.get("note"),
        ai_verified=c.proof.get("ai_verified"),
        ai_confidence=c.proof.get("ai_confidence"),
        reason=c.proof.get("reason", ""),
        method=c.proof.get("method", "none"),
        photo_check=c.proof.get("photo_check"),
        uploaded_at=datetime.fromisoformat(c.proof["uploaded_at"]),
    )


def _feedback_out(c: Complaint) -> FeedbackOut | None:
    if not c.feedback:
        return None
    return FeedbackOut(
        action=c.feedback["action"],
        rating=c.feedback.get("rating"),
        comment=c.feedback.get("comment"),
        created_at=datetime.fromisoformat(c.feedback["created_at"]),
    )


# --- serialisation -----------------------------------------------------------


def mask_phone(phone: str | None) -> str | None:
    if not phone or len(phone) < 7:
        return None
    return f"{phone[:3]}{'*' * (len(phone) - 7)}{phone[-4:]}"


def _location(c: Complaint) -> Location:
    return Location(lat=c.lat, lng=c.lng, address=c.address, ward_id=c.ward_id)


def to_staff_out(c: Complaint) -> ComplaintOut:
    return ComplaintOut(
        id=c.id,
        code=c.code,
        source=c.source,
        description=c.description,
        category=c.category,
        department=c.department,
        location=_location(c),
        photo_url=media_url(c.photo_path),
        photo_check=c.photo_meta,
        status=c.status,
        priority_score=c.priority_score,
        priority_level=priority_level(c.priority_score),
        ai=AiInfo(**c.ai) if c.ai else None,
        duplicate_count=c.duplicate_count,
        merged_into_id=c.merged_into_id,
        assigned_to=PersonRef(id=c.assigned_to.id, name=c.assigned_to.name)
        if c.assigned_to
        else None,
        sla_hours=c.sla_hours,
        sla_due_at=_aware(c.sla_due_at),
        escalation_level=c.escalation_level,
        proof=_proof_out(c),
        feedback=_feedback_out(c),
        resolved_at=_aware(c.resolved_at) if c.resolved_at else None,
        reporter=(
            ReporterRef(
                id=c.reporter.id, name=c.reporter.name, phone_masked=mask_phone(c.reporter.phone)
            )
            if c.reporter
            else None
        ),
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def to_citizen_out(c: Complaint) -> CitizenComplaintOut:
    ai = None
    if c.ai:
        ai = CitizenAiInfo(
            category_confidence=c.ai.get("category_confidence"), summary=c.ai.get("summary")
        )
    return CitizenComplaintOut(
        id=c.id,
        code=c.code,
        source=c.source,
        description=c.description,
        category=c.category,
        department=c.department,
        location=_location(c),
        photo_url=media_url(c.photo_path),
        photo_check=c.photo_meta,
        status=c.status,
        priority_score=c.priority_score,
        priority_level=priority_level(c.priority_score),
        ai=ai,
        duplicate_count=c.duplicate_count,
        merged_into_id=c.merged_into_id,
        assigned_to=CitizenAssignee(name=c.assigned_to.name) if c.assigned_to else None,
        sla_hours=c.sla_hours,
        sla_due_at=_aware(c.sla_due_at),
        proof=_proof_out(c),
        feedback=_feedback_out(c),
        resolved_at=_aware(c.resolved_at) if c.resolved_at else None,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )
