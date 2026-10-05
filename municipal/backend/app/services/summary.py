"""Dashboard KPIs and public statistics (API.md §6.8, §8).

Numbers are computed in Python from a few columns per complaint: simple, works the same on
PostgreSQL and SQLite, and is fast enough for a city prototype (tens of thousands of rows).
At real scale this would move to SQL aggregates or a nightly summary table.
"""

from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.constants import load_constants
from app.models import Complaint
from app.services.complaints import DUE_SOON_HOURS, SLA_STOPPED, _aware, _now

RESOLVED = ("resolved", "closed")
# Not counted in totals: merged reports live under their original, rejected ones were invalid.
NOT_COUNTED = ("merged", "rejected")
CITY_TZ = timezone(timedelta(hours=5, minutes=30))  # Kolhapur (IST)


@dataclass(frozen=True)
class Row:
    status: str
    department: str
    category: str
    ward_id: int | None
    escalation_level: int
    created_at: datetime
    resolved_at: datetime | None
    sla_due_at: datetime
    sla_breached_at: datetime | None
    rating: int | None


def load(db: Session, stmt: Select | None = None) -> list[Row]:
    """`stmt` is a complaint query (already scoped / filtered); defaults to all complaints."""
    stmt = stmt if stmt is not None else select(Complaint)
    rows = db.execute(
        stmt.with_only_columns(
            Complaint.status,
            Complaint.department,
            Complaint.category,
            Complaint.ward_id,
            Complaint.escalation_level,
            Complaint.created_at,
            Complaint.resolved_at,
            Complaint.sla_due_at,
            Complaint.sla_breached_at,
            Complaint.feedback,
        ).order_by(None)
    ).all()
    return [
        Row(
            status=r.status,
            department=r.department,
            category=r.category,
            ward_id=r.ward_id,
            escalation_level=r.escalation_level,
            created_at=_aware(r.created_at),
            resolved_at=_aware(r.resolved_at) if r.resolved_at else None,
            sla_due_at=_aware(r.sla_due_at),
            sla_breached_at=r.sla_breached_at,
            rating=(r.feedback or {}).get("rating"),
        )
        for r in rows
    ]


# --- building blocks ---------------------------------------------------------


def counted(rows: Iterable[Row]) -> list[Row]:
    return [r for r in rows if r.status not in NOT_COUNTED]


def is_open(r: Row) -> bool:
    return r.status not in SLA_STOPPED


def is_resolved(r: Row) -> bool:
    return r.status in RESOLVED


def is_overdue(r: Row, now: datetime) -> bool:
    return is_open(r) and r.sla_due_at < now


def resolution_rate(rows: list[Row]) -> float:
    total = counted(rows)
    return round(sum(map(is_resolved, total)) / len(total), 3) if total else 0.0


def avg_resolution_hours(rows: Iterable[Row]) -> float | None:
    hours = [
        (r.resolved_at - r.created_at).total_seconds() / 3600
        for r in rows
        if is_resolved(r) and r.resolved_at
    ]
    return round(sum(hours) / len(hours), 1) if hours else None


def satisfaction(rows: Iterable[Row]) -> tuple[float | None, int]:
    ratings = [r.rating for r in rows if r.rating]
    return (round(sum(ratings) / len(ratings), 1) if ratings else None), len(ratings)


def escalated_to(role: str, r: Row) -> bool:
    """Open complaints waiting at this role's level (ward rep sees everything above officer)."""
    if not is_open(r):
        return False
    if role == "ward_rep":
        return r.escalation_level >= 1
    return r.escalation_level == 2


# --- staff dashboard ---------------------------------------------------------


def kpis(rows: list[Row], role: str) -> dict:
    now = _now()
    week_ago = now - timedelta(days=7)
    rating_avg, _ = satisfaction(rows)
    return {
        "open": sum(map(is_open, rows)),
        "due_soon": sum(
            1
            for r in rows
            if is_open(r) and now <= r.sla_due_at <= now + timedelta(hours=DUE_SOON_HOURS)
        ),
        "overdue": sum(is_overdue(r, now) for r in rows),
        "resolved_this_week": sum(
            1 for r in rows if is_resolved(r) and r.resolved_at and r.resolved_at >= week_ago
        ),
        "avg_resolution_hours": avg_resolution_hours(rows),
        "resolution_rate": resolution_rate(rows),
        "escalated_to_me": (
            sum(escalated_to(role, r) for r in rows)
            if role in ("ward_rep", "mayor", "admin")
            else None
        ),
        "satisfaction_avg": rating_avg,
        "duplicates_merged": sum(1 for r in rows if r.status == "merged"),
    }


def by_department(rows: list[Row]) -> list[dict]:
    now = _now()
    groups: dict[str, list[Row]] = defaultdict(list)
    for r in counted(rows):
        groups[r.department].append(r)
    items = [
        {
            "department": department,
            "total": len(group),
            "open": sum(map(is_open, group)),
            "overdue": sum(is_overdue(r, now) for r in group),
            "resolved": sum(map(is_resolved, group)),
            "resolution_rate": resolution_rate(group),
            "avg_resolution_hours": avg_resolution_hours(group),
            "sla_breaches": sum(1 for r in group if r.sla_breached_at is not None),
        }
        for department, group in groups.items()
    ]
    # Ranking: best resolution rate first, fewer breaches breaks ties.
    return sorted(items, key=lambda d: (-d["resolution_rate"], d["sla_breaches"], d["department"]))


def by_ward(rows: list[Row], wards: list) -> list[dict]:
    now = _now()
    groups: dict[int, list[Row]] = defaultdict(list)
    for r in counted(rows):
        if r.ward_id is not None:
            groups[r.ward_id].append(r)
    return [
        {
            "ward_id": w.id,
            "number": w.number,
            "name": w.name,
            "lat": w.center_lat,
            "lng": w.center_lng,
            "total": len(groups[w.id]),
            "pending": sum(map(is_open, groups[w.id])),
            "overdue": sum(is_overdue(r, now) for r in groups[w.id]),
            "escalated": sum(1 for r in groups[w.id] if is_open(r) and r.escalation_level >= 1),
            "resolved": sum(map(is_resolved, groups[w.id])),
            "resolution_rate": resolution_rate(groups[w.id]),
        }
        for w in sorted(wards, key=lambda w: w.number)
    ]


def by_category(rows: list[Row]) -> list[dict]:
    counts = Counter(r.category for r in counted(rows))
    return [{"category": c, "count": n} for c, n in counts.most_common()]


# --- public statistics -------------------------------------------------------


def parse_period(period: str | None) -> tuple[str, datetime, datetime]:
    """'2026' or '2026-09' → (label, start, end) in city time. Default: this year."""
    if period is None:
        period = str(datetime.now(CITY_TZ).year)
    year, _, month = period.partition("-")
    start = datetime(int(year), int(month or 1), 1, tzinfo=CITY_TZ)
    if month:
        end = datetime(start.year + start.month // 12, start.month % 12 + 1, 1, tzinfo=CITY_TZ)
    else:
        end = datetime(start.year + 1, 1, 1, tzinfo=CITY_TZ)
    return period, start, end


def _month(value: datetime) -> str:
    return value.astimezone(CITY_TZ).strftime("%Y-%m")


def public_stats(rows: list[Row], wards: list, period: str, start: datetime, end: datetime):
    """Anonymous city numbers: counts and rates only, never people or exact locations."""
    rows = [r for r in counted(rows) if start <= r.created_at < end]
    rating_avg, ratings_count = satisfaction(rows)

    received = Counter(_month(r.created_at) for r in rows)
    resolved = Counter(_month(r.resolved_at) for r in rows if is_resolved(r) and r.resolved_at)
    last = min(end, max(_now(), start + timedelta(days=1)))
    months, cursor = [], start
    while cursor < last:
        months.append(cursor.strftime("%Y-%m"))
        cursor = datetime(
            cursor.year + cursor.month // 12, cursor.month % 12 + 1, 1, tzinfo=CITY_TZ
        )

    wards_out = [w for w in by_ward(rows, wards) if w["total"]]
    top = sorted(wards_out, key=lambda w: (-w["resolution_rate"], -w["resolved"]))[:5]
    departments = load_constants()["departments"]
    return {
        "period": period,
        "total_complaints": len(rows),
        "resolved": sum(map(is_resolved, rows)),
        "pending": sum(map(is_open, rows)),
        "resolution_rate": resolution_rate(rows),
        "avg_resolution_hours": avg_resolution_hours(rows),
        "satisfaction_avg": rating_avg,
        "ratings_count": ratings_count,
        "monthly": [{"month": m, "received": received[m], "resolved": resolved[m]} for m in months],
        "by_department": [
            {
                "department": d["department"],
                "total": d["total"],
                "resolution_rate": d["resolution_rate"],
                "avg_resolution_hours": d["avg_resolution_hours"],
            }
            for d in by_department(rows)
            if d["department"] in departments
        ],
        "top_wards": [
            {
                "ward_id": w["ward_id"],
                "number": w["number"],
                "name": w["name"],
                "resolved": w["resolved"],
                "resolution_rate": w["resolution_rate"],
            }
            for w in top
        ],
        "generated_at": datetime.now(UTC).isoformat(),
    }
