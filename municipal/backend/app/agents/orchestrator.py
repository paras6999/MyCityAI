"""Complaint triage pipeline built with LangGraph.

    analyze ──► embed ──► find_duplicate ──► score

analyze         Gemini reads photo + description (keyword fallback without AI)
embed           text embedding of the description, used to compare with nearby complaints
find_duplicate  same-category open complaint within 50 m (and similar text, when available)
score           priority 0-100 from severity, sensitive location and duplicates

Later phases add nodes here (announcement check in Phase 6, forecast risk in Phase 8).
"""

from dataclasses import dataclass
from typing import Any, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.agents import fallback, gemini
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
    priority: int


def analyze(state: TriageState) -> dict[str, Any]:
    description = state.get("description")
    chosen = state.get("chosen_category")
    result = gemini.analyze_issue(state["image"], state["mime_type"], description)
    if result is not None:
        return {
            # A category the citizen picked themselves wins; AI fills in everything else.
            "category": chosen or result.category,
            "confidence": result.confidence,
            "severity": result.severity,
            "summary": result.summary,
            "detected_objects": result.detected_objects,
            "sensitive_location": result.sensitive_location
            or fallback.mentions_sensitive_place(description),
            "is_civic_issue": result.is_civic_issue,
            "model": "gemini",
        }
    category, confidence = fallback.classify_text(description)
    category = chosen or category
    return {
        "category": category,
        "confidence": 1.0 if chosen else confidence,
        "severity": fallback.DEFAULT_SEVERITY[category],
        "summary": None,
        "detected_objects": [],
        "sensitive_location": fallback.mentions_sensitive_place(description),
        "is_civic_issue": True,
        "model": "keywords",
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


def score(state: TriageState) -> dict[str, Any]:
    return {
        "priority": compute_priority(
            severity=state["severity"], sensitive_location=state["sensitive_location"]
        )
    }


def _build_graph():
    graph = StateGraph(TriageState)
    graph.add_node("analyze", analyze)
    graph.add_node("embed", embed)
    graph.add_node("find_duplicate", check_duplicate)
    graph.add_node("score", score)
    graph.add_edge(START, "analyze")
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
    )
