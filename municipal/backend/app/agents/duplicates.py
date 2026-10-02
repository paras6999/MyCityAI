"""Find earlier open complaints that describe the same problem."""

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import limit
from app.models import Complaint

LOOKBACK_DAYS = 30
TEXT_SIMILARITY_THRESHOLD = 0.6
# Complaints in these states can no longer absorb new reports.
CLOSED = ("merged", "resolved", "closed", "rejected")


@dataclass
class Candidate:
    complaint: Complaint
    distance_m: float


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres (haversine)."""
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def nearby_open_complaints(
    db: Session, category: str, lat: float, lng: float, exclude_id: int | None = None
) -> list[Candidate]:
    """Open complaints of the same category within the duplicate radius, nearest first."""
    radius = limit("duplicate_radius_m")
    # Cheap bounding box first (1 degree latitude ≈ 111 km), exact distance after.
    dlat = radius / 111_000
    dlng = radius / (111_000 * max(0.1, math.cos(math.radians(lat))))
    stmt = select(Complaint).where(
        Complaint.category == category,
        Complaint.status.not_in(CLOSED),
        Complaint.created_at >= datetime.now(UTC) - timedelta(days=LOOKBACK_DAYS),
        Complaint.lat.between(lat - dlat, lat + dlat),
        Complaint.lng.between(lng - dlng, lng + dlng),
    )
    if exclude_id is not None:
        stmt = stmt.where(Complaint.id != exclude_id)
    candidates = [Candidate(c, distance_m(lat, lng, c.lat, c.lng)) for c in db.scalars(stmt)]
    return sorted((c for c in candidates if c.distance_m <= radius), key=lambda c: c.distance_m)


def find_duplicate(
    db: Session, category: str, lat: float, lng: float, embedding: list[float] | None
) -> Candidate | None:
    """Nearest same-category open complaint; if both have text embeddings they must also match."""
    for candidate in nearby_open_complaints(db, category, lat, lng):
        other = candidate.complaint.embedding
        if embedding and other and cosine(embedding, other) < TEXT_SIMILARITY_THRESHOLD:
            continue
        return candidate
    return None
