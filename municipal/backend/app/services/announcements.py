"""Announcement rules: who may post where, what is active, translations, auto-replies, pushes."""

from datetime import UTC, datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.agents import gemini
from app.core.errors import APIError
from app.models import Announcement, DeviceToken, User, Ward
from app.schemas.announcement import AnnouncementCreate, AnnouncementOut, AuthorRef, _Targeting
from app.services.push import Push

PUSHED_PRIORITIES = ("emergency", "important")
LANGUAGES = ("en", "mr", "hi")


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


# --- permissions -------------------------------------------------------------


def check_targeting(db: Session, user: User, target: _Targeting) -> None:
    """API.md §7: officer → own department · ward rep → own ward · city-wide → mayor/admin."""
    if target.city_wide and user.role not in ("mayor", "admin"):
        raise APIError(403, "FORBIDDEN", "Only the mayor's office can post city-wide")
    if user.role == "officer" and target.department != user.department:
        raise APIError(403, "FORBIDDEN", "Officers can only post for their own department")
    if user.role == "ward_rep" and target.ward_ids != [user.ward_id]:
        raise APIError(403, "FORBIDDEN", "Ward representatives can only post to their own ward")
    if target.ward_ids:
        known = set(db.scalars(select(Ward.id).where(Ward.id.in_(target.ward_ids))))
        unknown = sorted(set(target.ward_ids) - known)
        if unknown:
            raise APIError(
                400, "VALIDATION_ERROR", f"Unknown ward(s): {unknown}", [{"field": "ward_ids"}]
            )


def check_can_edit(user: User, announcement: Announcement) -> None:
    if user.role in ("mayor", "admin") or announcement.author_id == user.id:
        return
    raise APIError(403, "FORBIDDEN", "Only the author or the mayor's office can change this")


# --- queries -----------------------------------------------------------------


def is_active(announcement: Announcement, now: datetime | None = None) -> bool:
    now = now or _now()
    until = _aware(announcement.valid_until)
    return (
        announcement.status == "published"
        and _aware(announcement.valid_from) <= now
        and (until is None or until > now)
    )


def covers_ward(announcement: Announcement, ward_id: int | None) -> bool:
    return announcement.city_wide or (ward_id is not None and ward_id in announcement.ward_ids)


def for_ward(db: Session, ward_id: int | None, only_active: bool = True) -> list[Announcement]:
    """Published announcements a citizen of this ward should see, newest / most urgent first."""
    stmt = select(Announcement).where(Announcement.status == "published")
    items = [
        a for a in db.scalars(stmt) if covers_ward(a, ward_id) and (not only_active or is_active(a))
    ]
    rank = {"emergency": 0, "important": 1, "general": 2}
    return sorted(items, key=lambda a: (rank[a.priority], -_aware(a.valid_from).timestamp()))


def staff_scope(stmt: Select, user: User) -> Select:
    """Officers see their department's notices, ward reps their ward's; mayor/admin see all."""
    if user.role == "officer":
        return stmt.where(Announcement.department == user.department)
    return stmt


def visible_to_staff(user: User, announcement: Announcement) -> bool:
    if user.role == "ward_rep":
        return covers_ward(announcement, user.ward_id) or announcement.author_id == user.id
    if user.role == "officer":
        return announcement.department == user.department
    return True


def explaining(db: Session, category: str, ward_id: int | None) -> Announcement | None:
    """An active announcement that already explains this kind of complaint in this ward."""
    for announcement in for_ward(db, ward_id):
        if category in (announcement.linked_categories or []):
            return announcement
    return None


# --- create / translate ------------------------------------------------------


def translated(title_en: str, message_en: str, auto_translate: bool) -> tuple[dict, dict]:
    title = {"en": title_en, "mr": None, "hi": None}
    message = {"en": message_en, "mr": None, "hi": None}
    if auto_translate:
        result = gemini.translate_announcement(title_en, message_en)
        if result is not None:
            for lang in ("mr", "hi"):
                version = getattr(result, lang)
                title[lang], message[lang] = version.title, version.message
    return title, message


def create(
    db: Session,
    user: User,
    target: _Targeting,
    title: dict,
    message: dict,
    *,
    status: str = "published",
    ai_drafted: bool = False,
    source: str = "staff",
) -> Announcement:
    now = _now()
    announcement = Announcement(
        title=title,
        message=message,
        priority=target.priority,
        department=target.department,
        ward_ids=[] if target.city_wide else sorted(set(target.ward_ids)),
        city_wide=target.city_wide,
        author_id=user.id if user else None,
        source=source,
        ai_drafted=ai_drafted,
        status=status,
        valid_from=target.valid_from or now,
        valid_until=target.valid_until,
        recurrence=target.recurrence.model_dump() if target.recurrence else None,
        linked_categories=list(target.linked_categories),
        created_at=now,
        published_at=now if status == "published" else None,
    )
    db.add(announcement)
    db.flush()
    return announcement


def create_from_staff(db: Session, user: User, body: AnnouncementCreate) -> Announcement:
    title, message = translated(body.title_en.strip(), body.message_en.strip(), body.auto_translate)
    return create(db, user, body, title, message)


def draft(db: Session, user: User, body) -> Announcement:
    """AI-written draft (without Gemini: the note itself) — not visible to citizens yet."""
    note = body.text.strip()
    written = gemini.draft_announcement(note, body.department)
    title_en = written.title if written else note.split(".")[0][:80]
    message_en = written.message if written else note
    title, message = translated(title_en, message_en, auto_translate=True)
    return create(db, user, body, title, message, status="draft", ai_drafted=written is not None)


def publish(announcement: Announcement) -> None:
    if announcement.status == "published":
        raise APIError(409, "ALREADY_PUBLISHED", "This announcement is already published")
    announcement.status = "published"
    announcement.published_at = _now()


# --- output & push -----------------------------------------------------------


def to_out(a: Announcement) -> AnnouncementOut:
    return AnnouncementOut(
        id=a.id,
        title=a.title,
        message=a.message,
        priority=a.priority,
        department=a.department,
        ward_ids=a.ward_ids or [],
        city_wide=a.city_wide,
        author=AuthorRef.model_validate(a.author) if a.author else None,
        source=a.source,
        ai_drafted=a.ai_drafted,
        status=a.status,
        valid_from=_aware(a.valid_from),
        valid_until=_aware(a.valid_until),
        recurrence=a.recurrence,
        linked_categories=a.linked_categories or [],
        created_at=_aware(a.created_at),
        published_at=_aware(a.published_at),
    )


def text_in(field: dict, language: str) -> str:
    return field.get(language) or field["en"]


def build_pushes(db: Session, announcement: Announcement) -> list[Push]:
    """One notification batch per language for citizens in the covered wards."""
    if announcement.status != "published" or announcement.priority not in PUSHED_PRIORITIES:
        return []
    stmt = (
        select(DeviceToken.token, User.language)
        .join(User, User.id == DeviceToken.user_id)
        .where(User.role == "citizen")
    )
    if not announcement.city_wide:
        stmt = stmt.where(User.ward_id.in_(announcement.ward_ids or [-1]))
    by_language: dict[str, list[str]] = {}
    for token, language in db.execute(stmt):
        by_language.setdefault(language if language in LANGUAGES else "en", []).append(token)

    pushes = []
    for language, tokens in by_language.items():
        title = text_in(announcement.title, language)
        body = text_in(announcement.message, language)
        data = {
            "type": "announcement",
            "announcement_id": str(announcement.id),
            "priority": announcement.priority,
            "title": title,
            "body": body,
        }
        pushes.append(Push(tokens=tokens, title=title, body=body, data=data))
    return pushes
