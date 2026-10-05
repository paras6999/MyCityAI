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


class DetectionOut(BaseModel):
    """One object found by the YOLO model. `box` = [x1, y1, x2, y2] as fractions of the photo."""

    label: Category
    confidence: float
    box: list[float]


class AiInfo(BaseModel):
    category_confidence: float | None = None
    detected_objects: list[str] = []
    summary: str | None = None
    severity: int | None = None
    sensitive_location: bool = False
    model: Literal["yolo", "gemini", "keywords", "utilities"] | None = None
    detections: list[DetectionOut] = []
    # 0-1 from the Utilities agent (water / electricity only): open anomaly or forecast near
    # capacity in this ward. Adds up to +10 to the priority score.
    forecast_risk: float = 0.0


class PersonRef(BaseModel):
    id: int
    name: str | None


class ReporterRef(BaseModel):
    id: int
    name: str | None
    phone_masked: str | None


class PhotoCheckOut(BaseModel):
    """Was the photo taken on the spot, just now? (API.md §3.4 `photo_check`)"""

    live: bool
    source: Literal["exif", "app", "none"]
    captured_at: AwareDatetime | None
    accuracy_m: float | None
    distance_m: float | None
    problems: list[str]


class ProofOut(BaseModel):
    """API.md §3.7 — latest resolution proof."""

    after_photo_url: str | None
    note: str | None
    ai_verified: bool | None  # None = AI could not check
    ai_confidence: float | None
    reason: str
    method: Literal["identical", "yolo", "gemini", "none"]
    photo_check: PhotoCheckOut | None = None
    uploaded_at: AwareDatetime


class FeedbackOut(BaseModel):
    """API.md §3.8"""

    action: Literal["confirm", "reopen", "auto_closed"]
    rating: int | None
    comment: str | None
    created_at: AwareDatetime


class FeedbackIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["confirm", "reopen"]
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


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
    photo_check: PhotoCheckOut | None = None
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
    proof: ProofOut | None = None
    feedback: FeedbackOut | None = None
    resolved_at: AwareDatetime | None = None
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
    photo_check: PhotoCheckOut | None = None
    status: Status
    priority_score: int
    priority_level: PriorityLevel
    ai: CitizenAiInfo | None
    duplicate_count: int
    merged_into_id: int | None
    assigned_to: CitizenAssignee | None
    sla_hours: int
    sla_due_at: AwareDatetime
    proof: ProofOut | None = None
    feedback: FeedbackOut | None = None
    resolved_at: AwareDatetime | None = None
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


class EscalateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1, max_length=500)


class RemindIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str | None = Field(default=None, max_length=500)


class DuplicateHint(BaseModel):
    id: int
    code: str
    category: Category
    distance_m: float
    status: Status


class AnalyzeOut(BaseModel):
    """POST /citizen/complaints/analyze (API.md §5.1)."""

    suggested_category: Category
    department: Department
    confidence: float
    priority_level: PriorityLevel
    summary: str | None
    is_civic_issue: bool
    photo_check: PhotoCheckOut
    detections: list[DetectionOut]
    nearby_duplicates: list[DuplicateHint]
    active_announcement: dict[str, Any] | None = None  # Phase 6


class VerificationOut(BaseModel):
    ai_verified: bool | None
    ai_confidence: float | None
    reason: str
    method: Literal["identical", "yolo", "gemini", "none"]
    photo_check: PhotoCheckOut


class ProofResponse(BaseModel):
    """POST /staff/complaints/{id}/proof (API.md §6.5)."""

    complaint: ComplaintOut
    verification: VerificationOut
