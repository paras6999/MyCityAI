"""Announcements (API.md §7): citizens read their ward's feed; staff post within their scope."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import APIError
from app.core.security import CurrentUser, require_role
from app.models import Announcement, User
from app.schemas.announcement import (
    AnnouncementCreate,
    AnnouncementDraftRequest,
    AnnouncementOut,
    AnnouncementUpdate,
    _Targeting,
)
from app.schemas.common import Page
from app.services import announcements as service
from app.services import push
from app.services.realtime import hub

router = APIRouter(prefix="/announcements", tags=["announcements"])
DB = Annotated[Session, Depends(get_db)]
Poster = Annotated[User, Depends(require_role("officer", "ward_rep", "mayor", "admin"))]


def _get(db: Session, user: User, announcement_id: int) -> Announcement:
    announcement = db.get(Announcement, announcement_id)
    visible = announcement is not None and (
        (user.role == "citizen" and announcement.status == "published")
        or (user.role != "citizen" and service.visible_to_staff(user, announcement))
    )
    if not visible:
        raise APIError(404, "ANNOUNCEMENT_NOT_FOUND", f"Announcement {announcement_id} not found")
    return announcement


def _published(db: Session, announcement: Announcement, background: BackgroundTasks) -> None:
    """Push to citizens (important / emergency) and tell dashboards."""
    for notification in service.build_pushes(db, announcement):
        background.add_task(push.deliver, notification)
    hub.publish(
        "announcement.published",
        service.to_out(announcement).model_dump(mode="json"),
        department=announcement.department,
        ward_id=announcement.ward_ids[0] if len(announcement.ward_ids or []) == 1 else None,
    )


@router.get("", response_model=Page[AnnouncementOut])
def list_announcements(
    db: DB,
    user: CurrentUser,
    ward_id: int | None = None,
    active: bool = True,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """Citizens: their ward (or `ward_id`) + city-wide. Staff: everything in their scope,
    including drafts; `active=false` also shows expired / scheduled ones."""
    if user.role == "citizen":
        items = service.for_ward(db, ward_id or user.ward_id, only_active=active)
    else:
        stmt = service.staff_scope(select(Announcement), user)
        items = [
            a
            for a in db.scalars(stmt)
            if service.visible_to_staff(user, a)
            # drafts always show: they are waiting for approval
            and (not active or a.status == "draft" or service.is_active(a))
        ]
        if ward_id is not None:
            items = [a for a in items if service.covers_ward(a, ward_id)]
        items.sort(key=lambda a: a.created_at, reverse=True)
    start = (page - 1) * page_size
    return Page(
        items=[service.to_out(a) for a in items[start : start + page_size]],
        page=page,
        page_size=page_size,
        total=len(items),
    )


@router.get("/{announcement_id}", response_model=AnnouncementOut)
def get_announcement(announcement_id: int, db: DB, user: CurrentUser):
    return service.to_out(_get(db, user, announcement_id))


@router.post("", status_code=201, response_model=AnnouncementOut)
def create_announcement(
    body: AnnouncementCreate, db: DB, user: Poster, background: BackgroundTasks
):
    service.check_targeting(db, user, body)
    announcement = service.create_from_staff(db, user, body)
    db.commit()
    db.refresh(announcement)
    _published(db, announcement, background)
    return service.to_out(announcement)


@router.post("/draft", status_code=201, response_model=AnnouncementOut)
def draft_announcement(body: AnnouncementDraftRequest, db: DB, user: Poster):
    """AI turns a rough note into a translated draft; publish it with POST /{id}/publish."""
    service.check_targeting(db, user, body)
    announcement = service.draft(db, user, body)
    db.commit()
    db.refresh(announcement)
    return service.to_out(announcement)


@router.post("/{announcement_id}/publish", response_model=AnnouncementOut)
def publish_announcement(announcement_id: int, db: DB, user: Poster, background: BackgroundTasks):
    announcement = _get(db, user, announcement_id)
    service.check_can_edit(user, announcement)
    service.publish(announcement)
    db.commit()
    db.refresh(announcement)
    _published(db, announcement, background)
    return service.to_out(announcement)


@router.patch("/{announcement_id}", response_model=AnnouncementOut)
def update_announcement(announcement_id: int, body: AnnouncementUpdate, db: DB, user: Poster):
    announcement = _get(db, user, announcement_id)
    service.check_can_edit(user, announcement)
    changes = body.model_dump(exclude_unset=True)

    # Re-check who it is for, using the merged old + new values.
    target = _Targeting(
        priority=changes.get("priority", announcement.priority),
        department=announcement.department,
        ward_ids=changes.get("ward_ids", announcement.ward_ids),
        city_wide=changes.get("city_wide", announcement.city_wide),
        valid_from=changes.get("valid_from", announcement.valid_from),
        valid_until=changes.get("valid_until", announcement.valid_until),
    )
    service.check_targeting(db, user, target)
    for field, value in changes.items():
        setattr(announcement, field, value)
    if target.city_wide:
        announcement.ward_ids = []
    db.commit()
    db.refresh(announcement)
    return service.to_out(announcement)


@router.delete("/{announcement_id}", status_code=204)
def delete_announcement(announcement_id: int, db: DB, user: Poster):
    announcement = _get(db, user, announcement_id)
    service.check_can_edit(user, announcement)
    db.delete(announcement)
    db.commit()
    return Response(status_code=204)
