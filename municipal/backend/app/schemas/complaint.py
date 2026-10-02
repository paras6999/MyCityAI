"""Complaint schemas — field names match docs/API.md §3.4–3.6."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import AwareDatetime, Department, Role

Category = Literal[
    "pothole",
    "road_damage",
    "garbage",
    "illegal_dumping",
    "water_leakage",
    "no_water_supply",
    "pipeline_burst",
    "contaminated_water",
    "streetlight",
    "power_outage",
    "drainage_overflow",
    "waterlogging",
    "fallen_tree",
    "stray_animals",
    "other",
]
Status = Literal[
    "new", "merged", "assigned", "in_progress", "resolved", "closed", "reopened", "rejected"
]
PriorityLevel = Literal["low", "medium", "high", "critical"]
Source = Literal["citizen_app", "police_bridge", "sensor", "staff"]


class Location(BaseModel):
    lat: float
    lng: float
    address: str | None
    ward_id: int | None


class AiInfo(BaseModel):
    category_confidence: float | None = None
    detected_objects: list[str] = []
    summary: str | None = None


class PersonRef(BaseModel):
    id: int
    name: str | None


class ReporterRef(BaseModel):
    id: int
    name: str | None
    phone_masked: str | None


class ComplaintOut(BaseModel):
    """Full complaint as seen by staff (API.md §3.4)."""

    id: int
    code: str
    source: Source
    description: str | None
    category: Category
    department: Department
    location: Location
    photo_url: str | None
    status: Status
    priority_score: int
    priority_level: PriorityLevel
    ai: AiInfo | None
    duplicate_count: int
    merged_into_id: int | None
    assigned_to: PersonRef | None
    sla_hours: int
    sla_due_at: AwareDatetime
    escalation_level: int
    proof: dict[str, Any] | None = None  # Phase 5
    feedback: dict[str, Any] | None = None  # Phase 5
    reporter: ReporterRef | None
    created_at: AwareDatetime
    updated_at: AwareDatetime


class CitizenAiInfo(BaseModel):
    category_confidence: float | None = None
    summary: str | None = None


class CitizenAssignee(BaseModel):
    name: str | None


class CitizenComplaintOut(BaseModel):
    """Complaint as seen by its reporter (API.md §3.5)."""

    id: int
    code: str
    source: Source
    description: str | None
    category: Category
    department: Department
    location: Location
    photo_url: str | None
    status: Status
    priority_score: int
    priority_level: PriorityLevel
    ai: CitizenAiInfo | None
    duplicate_count: int
    merged_into_id: int | None
    assigned_to: CitizenAssignee | None
    sla_hours: int
    sla_due_at: AwareDatetime
    proof: dict[str, Any] | None = None
    feedback: dict[str, Any] | None = None
    created_at: AwareDatetime
    updated_at: AwareDatetime


class ActorRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None
    role: Role


class TimelineEventOut(BaseModel):
    """API.md §3.6"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    complaint_id: int
    type: str
    from_status: Status | None
    to_status: Status | None
    note: str | None
    actor: ActorRef | None
    created_at: AwareDatetime


class ComplaintUpdate(BaseModel):
    """PATCH /staff/complaints/{id} (API.md §6.4) — all fields optional."""

    model_config = ConfigDict(extra="forbid")

    status: Status | None = None
    assigned_to_id: int | None = None
    note: str | None = Field(default=None, max_length=1000)
    category: Category | None = None
    department: Department | None = None


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str = Field(min_length=1, max_length=1000)
