from types import SimpleNamespace

import pytest

from app.agents import fallback, gemini
from app.agents.gemini import IssueAnalysis
from app.agents.priority import compute_priority
from app.models import Complaint
from tests.conftest import auth_header
from tests.test_complaints import PNG, citizen_token, staff_id, staff_token, submit
from tests.test_realtime import EXPO_TOKEN, register_device, sent  # noqa: F401 (fixture)

NEAR_A = {"lat": "16.69690", "lng": "74.25310"}
NEAR_B = {"lat": "16.69700", "lng": "74.25320"}  # ~15 m from A
FAR = {"lat": "16.70500", "lng": "74.24000"}  # ~1.6 km from A


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)


def fake_gemini(monkeypatch, **overrides):
    analysis = IssueAnalysis(
        is_civic_issue=True,
        category="water_leakage",
        confidence=0.93,
        severity=72,
        summary="Water leaking from a broken pipe near the school gate",
        detected_objects=["pipe", "water"],
        sensitive_location=True,
    ).model_copy(update=overrides)
    monkeypatch.setattr("app.agents.gemini.analyze_issue", lambda *args: analysis)
    return analysis


# --- priority & fallback -----------------------------------------------------


def test_priority_combines_severity_and_boosts():
    assert compute_priority(60) == 60
    assert compute_priority(60, duplicate_count=2) == 70
    assert compute_priority(60, sensitive_location=True) == 75
    assert compute_priority(60, sla_elapsed_fraction=1.5) == 75  # waiting boost is capped
    assert compute_priority(95, duplicate_count=10, sensitive_location=True) == 100


@pytest.mark.parametrize(
    ("text", "category"),
    [
        ("Huge pothole near the market", "pothole"),
        ("garbage not collected for 5 days", "garbage"),
        ("रस्त्यावर मोठा खड्डा आहे", "pothole"),
        ("pani nahi aa raha since morning", "no_water_supply"),
        ("Please help", "other"),
    ],
)
def test_keyword_fallback(text, category):
    assert fallback.classify_text(text)[0] == category


def test_gemini_wrapper_parses_structured_response(monkeypatch):
    expected = IssueAnalysis(
        is_civic_issue=True,
        category="garbage",
        confidence=0.8,
        severity=50,
        summary="Overflowing bin",
        detected_objects=["bin"],
        sensitive_location=False,
    )
    calls = {}

    def generate_content(**kwargs):
        calls.update(kwargs)
        return SimpleNamespace(parsed=expected, text=None)

    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr("app.agents.gemini._client", lambda: client)

    assert gemini.analyze_issue(PNG, "image/png", "bin full") == expected
    assert calls["config"].response_schema is IssueAnalysis


def test_gemini_errors_return_none(monkeypatch):
    def boom(**kwargs):
        raise RuntimeError("quota exceeded")

    client = SimpleNamespace(models=SimpleNamespace(generate_content=boom))
    monkeypatch.setattr("app.agents.gemini._client", lambda: client)

    assert gemini.analyze_issue(PNG, "image/png", None) is None


# --- triage on submit --------------------------------------------------------


def test_ai_classifies_and_scores_submission(client, monkeypatch):
    fake_gemini(monkeypatch)
    complaint = submit(client, citizen_token(client), description="water everywhere")
    staff_view = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}",
        headers=auth_header(staff_token(client, "officer.water")),
    ).json()

    assert complaint["category"] == "water_leakage"
    assert complaint["department"] == "water"
    assert complaint["priority_score"] == 87  # severity 72 + sensitive location 15
    assert complaint["ai"]["summary"].startswith("Water leaking")
    assert staff_view["ai"]["model"] == "gemini"
    assert staff_view["ai"]["detected_objects"] == ["pipe", "water"]


def test_citizen_choice_overrides_ai_category(client, monkeypatch):
    fake_gemini(monkeypatch)
    complaint = submit(client, citizen_token(client), category="pipeline_burst")

    assert complaint["category"] == "pipeline_burst"
    assert complaint["ai"]["summary"]  # AI still adds its summary


# --- duplicates --------------------------------------------------------------


def test_nearby_same_issue_is_merged(client, db):
    first = submit(client, citizen_token(client, "+919811111111"), category="pothole", **NEAR_A)
    second_token = citizen_token(client, "+919822222222")
    second = submit(client, second_token, category="pothole", **NEAR_B)

    original = db.get(Complaint, first["id"])
    assert second["status"] == "merged"
    assert second["merged_into_id"] == first["id"]
    assert original.duplicate_count == 1
    assert original.priority_score == first["priority_score"] + 5

    # The second citizen can follow the original complaint.
    followed = client.get(
        f"/api/v1/citizen/complaints/{first['id']}", headers=auth_header(second_token)
    )
    assert followed.status_code == 200

    roads = auth_header(staff_token(client, "officer.roads"))
    duplicates = client.get(f"/api/v1/staff/complaints/{first['id']}/duplicates", headers=roads)
    assert [d["id"] for d in duplicates.json()["items"]] == [second["id"]]


@pytest.mark.parametrize(
    ("second_fields"),
    [
        {"category": "pothole", **FAR},  # too far away
        {"category": "garbage", **NEAR_B},  # different problem
    ],
)
def test_not_merged_when_far_or_different(client, second_fields):
    submit(client, citizen_token(client, "+919811111111"), category="pothole", **NEAR_A)
    second = submit(client, citizen_token(client, "+919822222222"), **second_fields)

    assert second["status"] == "new"


def test_different_text_is_not_merged(client, monkeypatch):
    vectors = iter([[1.0, 0.0], [0.0, 1.0]])
    monkeypatch.setattr("app.agents.gemini.embed_text", lambda text: next(vectors))
    submit(client, citizen_token(client, "+919811111111"), category="pothole", **NEAR_A)
    second = submit(client, citizen_token(client, "+919822222222"), category="pothole", **NEAR_B)

    assert second["status"] == "new"


def test_followers_get_status_pushes(client, sent):  # noqa: F811
    first = submit(client, citizen_token(client, "+919811111111"), category="pothole", **NEAR_A)
    follower = citizen_token(client, "+919822222222")
    register_device(client, follower)
    submit(client, follower, category="pothole", **NEAR_B)
    roads = staff_token(client, "officer.roads")

    client.patch(
        f"/api/v1/staff/complaints/{first['id']}",
        json={"assigned_to_id": staff_id(client, roads, "roads")},
        headers=auth_header(roads),
    )

    assert [m["to"] for m in sent] == [EXPO_TOKEN]


# --- analyze preview ---------------------------------------------------------


def test_analyze_previews_without_saving(client, db, monkeypatch):
    submit(client, citizen_token(client, "+919811111111"), category="water_leakage", **NEAR_A)
    fake_gemini(monkeypatch)
    token = citizen_token(client, "+919822222222")
    before = db.query(Complaint).count()

    response = client.post(
        "/api/v1/citizen/complaints/analyze",
        data={**NEAR_B, "description": "leak"},
        files={"photo": ("p.png", PNG, "image/png")},
        headers=auth_header(token),
    )
    body = response.json()

    assert response.status_code == 200
    assert body["suggested_category"] == "water_leakage"
    assert body["department"] == "water"
    assert body["priority_level"] == "high"
    assert body["is_civic_issue"] is True
    assert len(body["nearby_duplicates"]) == 1
    assert body["nearby_duplicates"][0]["distance_m"] < 50
    assert db.query(Complaint).count() == before
