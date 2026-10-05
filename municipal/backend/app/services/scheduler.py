"""Periodic background jobs: SLA escalation and auto-close.

Runs inside the API process: fine for one backend worker. With several workers, run the jobs
in exactly one of them (or a separate process) to avoid doing the work twice.
"""

import asyncio
import logging

from app.core.config import get_settings
from app.core.constants import limit
from app.core.db import SessionLocal
from app.services import complaints as service
from app.services import escalation
from app.services.realtime import hub

logger = logging.getLogger(__name__)


def auto_close_job() -> int:
    """Close complaints resolved too long ago without citizen feedback."""
    with SessionLocal() as db:
        closed = service.close_stale_resolved(db, limit("auto_close_after_resolved_hours"))
        db.commit()
        for complaint in closed:
            db.refresh(complaint)
            hub.publish(
                "complaint.updated",
                service.to_staff_out(complaint).model_dump(mode="json"),
                department=complaint.department,
                ward_id=complaint.ward_id,
            )
    if closed:
        logger.info("Auto-closed %d resolved complaint(s)", len(closed))
    return len(closed)


def escalation_job() -> int:
    """Escalation Agent: complaints past their deadline move up one level."""
    with SessionLocal() as db:
        escalated = escalation.escalate_overdue(db)
        db.commit()
        for complaint in escalated:
            db.refresh(complaint)
            hub.publish(
                "complaint.escalated",
                service.to_staff_out(complaint).model_dump(mode="json"),
                department=complaint.department,
                ward_id=complaint.ward_id,
            )
    if escalated:
        logger.info("Escalated %d overdue complaint(s)", len(escalated))
    return len(escalated)


JOBS = [escalation_job, auto_close_job]


async def _run_forever(interval_seconds: int) -> None:
    while True:
        for job in JOBS:
            try:
                await asyncio.to_thread(job)
            except Exception:
                logger.exception("Scheduled job %s failed", job.__name__)
        await asyncio.sleep(interval_seconds)


def start() -> asyncio.Task | None:
    settings = get_settings()
    if not settings.scheduler_enabled:
        return None
    return asyncio.create_task(_run_forever(settings.scheduler_interval_seconds), name="scheduler")
