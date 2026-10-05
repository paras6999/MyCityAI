"""Push notifications to the citizen app through the Expo push service (API.md §10.2)."""

import logging
from dataclasses import dataclass

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Complaint, DeviceToken, User

logger = logging.getLogger(__name__)
EXPO_BATCH = 100

# Short status messages in the citizen's language. {code} = complaint code.
STATUS_MESSAGES: dict[str, dict[str, str]] = {
    "assigned": {
        "en": "Your complaint {code} has been assigned to an officer.",
        "mr": "तुमची तक्रार {code} अधिकाऱ्याकडे सोपवली आहे.",
        "hi": "आपकी शिकायत {code} अधिकारी को सौंपी गई है।",
    },
    "in_progress": {
        "en": "Work has started on your complaint {code}.",
        "mr": "तुमच्या तक्रारीवर ({code}) काम सुरू झाले आहे.",
        "hi": "आपकी शिकायत {code} पर काम शुरू हो गया है।",
    },
    "resolved": {
        "en": "Your complaint {code} has been resolved. Please confirm or reopen it in the app.",
        "mr": "तुमची तक्रार {code} सोडवली गेली आहे. कृपया ॲपमध्ये खात्री करा किंवा पुन्हा उघडा.",
        "hi": "आपकी शिकायत {code} हल कर दी गई है। कृपया ऐप में पुष्टि करें या फिर से खोलें।",
    },
    "rejected": {
        "en": "Your complaint {code} was rejected: {note}",
        "mr": "तुमची तक्रार {code} नाकारली गेली: {note}",
        "hi": "आपकी शिकायत {code} अस्वीकार की गई: {note}",
    },
}


def status_message(status: str, language: str, code: str, note: str | None) -> str | None:
    templates = STATUS_MESSAGES.get(status)
    if templates is None:
        return None
    template = templates.get(language) or templates["en"]
    return template.format(code=code, note=note or "")


def send_expo(messages: list[dict]) -> list[dict]:
    """POST messages to Expo; returns one ticket per message."""
    response = httpx.post(get_settings().expo_push_url, json=messages, timeout=10)
    response.raise_for_status()
    return response.json().get("data", [])


@dataclass(frozen=True)
class Push:
    tokens: list[str]
    title: str
    body: str
    data: dict[str, str]


def build_status_push(
    db: Session, complaint: Complaint, status: str, note: str | None
) -> Push | None:
    """Notification for the reporter about a status change, or None if there is nothing to send."""
    if complaint.reporter_id is None:
        return None
    reporter = db.get(User, complaint.reporter_id)
    body = status_message(status, reporter.language if reporter else "en", complaint.code, note)
    # Citizens whose duplicate reports were merged into this complaint follow it too.
    followers = select(Complaint.reporter_id).where(Complaint.merged_into_id == complaint.id)
    tokens = list(
        db.scalars(
            select(DeviceToken.token).where(
                (DeviceToken.user_id == complaint.reporter_id) | DeviceToken.user_id.in_(followers)
            )
        )
    )
    if body is None or not tokens:
        return None
    title = f"Complaint {complaint.code}"
    data = {
        # A resolved complaint asks the citizen to confirm or reopen (API.md §10.2).
        "type": "feedback_request" if status == "resolved" else "complaint_status",
        "complaint_id": str(complaint.id),
        "status": status,
        "title": title,
        "body": body,
    }
    return Push(tokens=tokens, title=title, body=body, data=data)


def deliver(push: Push) -> None:
    """Send a notification (run as a background task, after the response)."""
    messages = [
        {"to": t, "title": push.title, "body": push.body, "data": push.data, "sound": "default"}
        for t in push.tokens
    ]
    if not get_settings().push_enabled:
        logger.info("Push disabled; would send %r to %d device(s)", push.body, len(messages))
        return
    tickets: list[dict] = []
    try:
        for start in range(0, len(messages), EXPO_BATCH):  # Expo accepts 100 per request
            tickets += send_expo(messages[start : start + EXPO_BATCH])
    except Exception:
        logger.exception("Expo push request failed")
        return
    # Forget phones that uninstalled the app or revoked permission.
    dead = [
        message["to"]
        for message, ticket in zip(messages, tickets, strict=False)
        if ticket.get("details", {}).get("error") == "DeviceNotRegistered"
    ]
    if dead:
        with SessionLocal() as db:
            db.execute(delete(DeviceToken).where(DeviceToken.token.in_(dead)))
            db.commit()
