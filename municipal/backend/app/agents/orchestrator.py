"""Complaint triage pipeline built with LangGraph.

    detect ──► analyze ──► embed ──► find_duplicate ──► score

detect          local YOLO models find potholes, animals, ... in the photo (free, offline)
analyze         combines: citizen's choice > YOLO > Gemini > keywords for the category;
                Gemini (optional) adds severity and a summary
embed           text embedding of the description, used to compare with nearby complaints
find_duplicate  same-category open complaint within 50 m (and similar text, when available)
score           priority 0-100 from severity, sensitive location and duplicates

The score step adds the Utilities agent's forecast risk for water / electricity issues.
"""

from dataclasses import dataclass
from typing import Any, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.agents import fallback, gemini, vision
from app.agents.duplicates import find_duplicate
from app.agents.priority import compute_priority
from app.core.constants import category_info


class TriageState(TypedDict, total=False):
    # inputs
    image: bytes
    mime_type: str
    description: str | None
    lat: float
    lng: float
    chosen_category: str | None
    # outputs
    detections: list[vision.Detection] | None
    category: str
    confidence: float
    severity: int
    summary: str | None
    detected_objects: list[str]
    sensitive_location: bool
    is_civic_issue: bool
    model: str
    embedding: list[float] | None
    duplicate_id: int | None
    duplicate_distance_m: float | None
    forecast_risk: float
    priority: int


def detect_objects(state: TriageState) -> dict[str, Any]:
    return {"detections": vision.detect(state["image"])}


def analyze(state: TriageState) -> dict[str, Any]:
    description = state.get("description")
    chosen = state.get("chosen_category")
    detections = state.get("detections") or []
    vision_pick = vision.best_category(detections)
    ai = gemini.analyze_issue(state["image"], state["mime_type"], description)

    # Category: what the citizen picked > what our model saw > Gemini > keywords
    if chosen:
        category, confidence = chosen, 1.0
    elif vision_pick:
        category, confidence = vision_pick
    elif ai is not None:
        category, confidence = ai.category, ai.confidence
    else:
        category, confidence = fallback.classify_text(description)

    if ai is not None:
        severity = ai.severity
    elif any(d.category == category for d in detections):
        severity = vision.severity_from(category, detections)
    else:
        severity = fallback.DEFAULT_SEVERITY[category]

    if detections:
        model = "yolo"
    elif ai is not None:
        model = "gemini"
    else:
        model = "keywords"

    objects = list(
        dict.fromkeys([d.category for d in detections] + (ai.detected_objects if ai else []))
    )
    return {
        "category": category,
        "confidence": confidence,
        "severity": severity,
        "summary": ai.summary if ai else None,
        "detected_objects": objects,
        "sensitive_location": bool(ai and ai.sensitive_location)
        or fallback.mentions_sensitive_place(description),
        "is_civic_issue": bool(detections) or (ai.is_civic_issue if ai else True),
        "model": model,
    }


def embed(state: TriageState) -> dict[str, Any]:
    text = " ".join(filter(None, [state.get("description"), state.get("summary")]))
    return {"embedding": gemini.embed_text(text)}


def check_duplicate(state: TriageState, config: RunnableConfig) -> dict[str, Any]:
    db: Session = config["configurable"]["db"]
    match = find_duplicate(
        db, state["category"], state["lat"], state["lng"], state.get("embedding")
    )
    if match is None:
        return {"duplicate_id": None, "duplicate_distance_m": None}
    return {"duplicate_id": match.complaint.id, "duplicate_distance_m": round(match.distance_m, 1)}


def score(state: TriageState, config: RunnableConfig) -> dict[str, Any]:
    from app.services import complaints, utilities  # services import agents; avoid a cycle

    db: Session = config["configurable"]["db"]
    risk = utilities.risk_for(
        db,
        category_info(state["category"])["department"],
        complaints.nearest_ward_id(db, state["lat"], state["lng"]),
    )
    return {
        "forecast_risk": risk,
        "priority": compute_priority(
            severity=state["severity"],
            sensitive_location=state["sensitive_location"],
            forecast_risk=risk,
        ),
    }


def _build_graph():
    graph = StateGraph(TriageState)
    graph.add_node("detect", detect_objects)
    graph.add_node("analyze", analyze)
    graph.add_node("embed", embed)
    graph.add_node("find_duplicate", check_duplicate)
    graph.add_node("score", score)
    graph.add_edge(START, "detect")
    graph.add_edge("detect", "analyze")
    graph.add_edge("analyze", "embed")
    graph.add_edge("embed", "find_duplicate")
    graph.add_edge("find_duplicate", "score")
    graph.add_edge("score", END)
    return graph.compile()


TRIAGE_GRAPH = _build_graph()


@dataclass
class Triage:
    category: str
    department: str
    confidence: float
    severity: int
    summary: str | None
    detected_objects: list[str]
    sensitive_location: bool
    is_civic_issue: bool
    model: str
    embedding: list[float] | None
    priority: int
    duplicate_id: int | None
    duplicate_distance_m: float | None
    detections: list[vision.Detection]
    forecast_risk: float = 0.0

    @property
    def ai_info(self) -> dict[str, Any]:
        """Stored in Complaint.ai (API.md §3.4 `ai`)."""
        return {
            "category_confidence": round(self.confidence, 2),
            "detected_objects": self.detected_objects,
            "summary": self.summary,
            "severity": self.severity,
            "sensitive_location": self.sensitive_location,
            "model": self.model,
            "detections": [d.to_json() for d in self.detections],
            "forecast_risk": self.forecast_risk,
        }


def run_triage(
    db: Session,
    *,
    image: bytes,
    mime_type: str,
    description: str | None,
    lat: float,
    lng: float,
    chosen_category: str | None = None,
) -> Triage:
    state = TRIAGE_GRAPH.invoke(
        {
            "image": image,
            "mime_type": mime_type,
            "description": description,
            "lat": lat,
            "lng": lng,
            "chosen_category": chosen_category,
        },
        config={"configurable": {"db": db}},
    )
    return Triage(
        category=state["category"],
        department=category_info(state["category"])["department"],
        confidence=state["confidence"],
        severity=state["severity"],
        summary=state["summary"],
        detected_objects=state["detected_objects"],
        sensitive_location=state["sensitive_location"],
        is_civic_issue=state["is_civic_issue"],
        model=state["model"],
        embedding=state.get("embedding"),
        priority=state["priority"],
        duplicate_id=state.get("duplicate_id"),
        duplicate_distance_m=state.get("duplicate_distance_m"),
        detections=state.get("detections") or [],
        forecast_risk=state.get("forecast_risk", 0.0),
    )
