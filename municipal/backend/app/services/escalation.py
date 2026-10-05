"""Escalation Agent (API.md §6.6): missed deadlines move a complaint up officer → ward rep → mayor.

Level 0 = department officer, 1 = ward representative, 2 = mayor (shared/constants.json).
Each step gives the next level `escalation_extra_hours` before the next automatic step.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import limit
from app.core.errors import APIError
from app.models import Complaint, TimelineEvent, User
from app.services.complaints import SLA_STOPPED, _aware, _now, add_event

MAX_LEVEL = 2
LEVEL_NAMES = {1: "ward representative", 2: "mayor"}
# The level a staff member works at; they may push a complaint one step above it.
ROLE_LEVEL = {"officer": 0, "ward_rep": 1}
REMINDER_GAP = timedelta(hours=1)


def _raise_level(db: Session, complaint: Complaint, actor: User | None, note: str) -> None:
    now = _now()
    complaint.escalation_level += 1
    # The new level gets at least `escalation_extra_hours` to act.
    extra = now + timedelta(hours=limit("escalation_extra_hours"))
    complaint.sla_due_at = max(_aware(complaint.sla_due_at), extra)
    complaint.updated_at = now
    add_event(db, complaint, "escalated", actor, note=note)


def escalate_overdue(db: Session) -> list[Complaint]:
    """Raise every open complaint whose deadline has passed by one level. Caller commits."""
    now = _now()
    overdue = list(
        db.scalars(
            select(Complaint).where(
                Complaint.status.not_in(SLA_STOPPED),
                Complaint.sla_due_at < now,
                Complaint.escalation_level < MAX_LEVEL,
            )
        )
    )
    for complaint in overdue:
        if complaint.sla_breached_at is None:
            complaint.sla_breached_at = now
        level = LEVEL_NAMES[complaint.escalation_level + 1]
        _raise_level(db, complaint, None, f"Deadline missed: escalated to the {level}")
    return overdue


def escalate_manually(db: Session, complaint: Complaint, actor: User, reason: str) -> None:
    """Officer → ward rep, or ward rep → mayor (e.g. needs budget or another department)."""
    if complaint.status in SLA_STOPPED:
        raise APIError(409, "INVALID_STATUS_TRANSITION", "Only open complaints can be escalated")
    if complaint.escalation_level >= MAX_LEVEL:
        raise APIError(409, "ALREADY_AT_MAYOR", "This complaint is already with the mayor")
    if complaint.escalation_level > ROLE_LEVEL.get(actor.role, -1):
        raise APIError(409, "ALREADY_ESCALATED", "This complaint is already above your level")
    level = LEVEL_NAMES[complaint.escalation_level + 1]
    _raise_level(db, complaint, actor, f"Escalated to the {level}: {reason}")


def remind(db: Session, complaint: Complaint, actor: User, note: str | None) -> None:
    """Ward rep / mayor chases the department. One reminder per hour per complaint."""
    if complaint.status in SLA_STOPPED:
        raise APIError(409, "INVALID_STATUS_TRANSITION", "This complaint is no longer open")
    last = db.scalar(
        select(TimelineEvent.created_at)
        .where(TimelineEvent.complaint_id == complaint.id, TimelineEvent.type == "reminder")
        .order_by(TimelineEvent.created_at.desc())
        .limit(1)
    )
    if last is not None and _now() - _aware(last) < REMINDER_GAP:
        raise APIError(429, "REMINDED_RECENTLY", "A reminder was already sent in the last hour")
    add_event(db, complaint, "reminder", actor, note=note)
