import re

import pytest
from fastapi.testclient import TestClient

from app.seed import seed_demo
from tests.conftest import DEV_OTP, SEED_PASSWORD, auth_header

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
RAJARAMPURI = {"lat": "16.6969", "lng": "74.2531"}  # next to the ward 12 centre


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)


def citizen_token(client: TestClient, phone: str = "+919811111111") -> str:
    client.post("/api/v1/auth/otp/request", json={"phone": phone})
    response = client.post("/api/v1/auth/otp/verify", json={"phone": phone, "otp": DEV_OTP})
    return response.json()["access_token"]


def staff_token(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/v1/auth/login", json={"username": username, "password": SEED_PASSWORD}
    )
    return response.json()["access_token"]


def submit(client: TestClient, token: str, **fields) -> dict:
    data = {**RAJARAMPURI, "description": "Big pothole near bus stop", **fields}
    response = client.post(
        "/api/v1/citizen/complaints",
        data=data,
        files={"photo": ("photo.png", PNG, "image/png")},
        headers=auth_header(token),
    )
    assert response.status_code == 201, response.json()
    return response.json()


def staff_id(client: TestClient, token: str, username_dept: str) -> int:
    users = client.get(
        f"/api/v1/staff/users?department={username_dept}&role=officer", headers=auth_header(token)
    ).json()["items"]
    return users[0]["id"]


# --- citizen -----------------------------------------------------------------


def test_citizen_submits_complaint(client):
    body = submit(client, citizen_token(client), category="pothole")

    assert re.fullmatch(r"KMC-\d{4}-\d{5}", body["code"])
    assert body["status"] == "new"
    assert body["department"] == "roads"
    assert body["sla_hours"] == 48
    # keyword fallback: pothole severity 60 + "bus stop" sensitive-location boost 15
    assert body["priority_score"] == 75
    assert body["priority_level"] == "high"
    assert body["ai"]["category_confidence"] == 1.0  # category chosen by the citizen
    assert body["location"]["ward_id"] is not None
    assert body["photo_url"] == f"/media/complaints/{body['id']}/photo.png"
    assert "reporter" not in body  # citizens don't see the reporter block


def test_complaint_gets_nearest_ward(client):
    token = citizen_token(client)
    body = submit(client, token)
    wards = client.get("/api/v1/wards").json()["items"]

    assert next(w for w in wards if w["id"] == body["location"]["ward_id"])["number"] == 12


def test_missing_category_is_classified_from_text(client):
    token = citizen_token(client)

    assert submit(client, token, description="Big khadda on the main road")["category"] == "pothole"
    unclear = submit(client, token, description="Please look into this", lat="16.70", lng="74.20")
    assert unclear["category"] == "other"
    assert unclear["department"] == "other"


def test_photo_must_be_an_image(client):
    response = client.post(
        "/api/v1/citizen/complaints",
        data=RAJARAMPURI,
        files={"photo": ("notes.txt", b"hello", "text/plain")},
        headers=auth_header(citizen_token(client)),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_staff_cannot_submit_as_citizen(client):
    response = client.post(
        "/api/v1/citizen/complaints",
        data=RAJARAMPURI,
        files={"photo": ("p.png", PNG, "image/png")},
        headers=auth_header(staff_token(client, "mayor")),
    )

    assert response.status_code == 403


def test_citizen_only_sees_own_complaints(client):
    alice, bob = citizen_token(client, "+919811111111"), citizen_token(client, "+919822222222")
    complaint = submit(client, alice)

    assert client.get("/api/v1/citizen/complaints", headers=auth_header(alice)).json()["total"] == 1
    assert client.get("/api/v1/citizen/complaints", headers=auth_header(bob)).json()["total"] == 0
    response = client.get(f"/api/v1/citizen/complaints/{complaint['id']}", headers=auth_header(bob))
    assert response.status_code == 404


def test_citizen_timeline_and_home(client):
    token = citizen_token(client)
    complaint = submit(client, token, category="garbage")

    timeline = client.get(
        f"/api/v1/citizen/complaints/{complaint['id']}/timeline", headers=auth_header(token)
    ).json()["items"]
    home = client.get("/api/v1/citizen/home", headers=auth_header(token)).json()

    assert [e["type"] for e in timeline] == ["created", "classified"]
    assert home["open_complaints"] == 1
    assert home["recent_complaints"][0]["id"] == complaint["id"]
    assert home["announcements"] == []


# --- staff visibility --------------------------------------------------------


def test_officer_sees_only_own_department(client):
    submit(client, citizen_token(client), category="pothole")
    roads = staff_token(client, "officer.roads")
    water = staff_token(client, "officer.water")

    assert client.get("/api/v1/staff/complaints", headers=auth_header(roads)).json()["total"] == 1
    assert client.get("/api/v1/staff/complaints", headers=auth_header(water)).json()["total"] == 0


def test_staff_sees_masked_reporter_phone(client):
    complaint = submit(client, citizen_token(client, "+919876543210"), category="pothole")
    body = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}",
        headers=auth_header(staff_token(client, "officer.roads")),
    ).json()

    assert body["reporter"]["phone_masked"] == "+91******3210"


def test_ward_rep_sees_only_own_ward(client, db):
    seed_demo(db)
    ward12 = staff_token(client, "wardrep.12")
    items = client.get(
        "/api/v1/staff/complaints?page_size=100", headers=auth_header(ward12)
    ).json()["items"]
    wards = client.get("/api/v1/wards").json()["items"]
    ward12_id = next(w["id"] for w in wards if w["number"] == 12)

    assert items and all(c["location"]["ward_id"] == ward12_id for c in items)


def test_queue_sorted_by_priority_and_filters(client, db):
    seed_demo(db)
    mayor = auth_header(staff_token(client, "mayor"))

    scores = [
        c["priority_score"]
        for c in client.get("/api/v1/staff/complaints?page_size=100", headers=mayor).json()["items"]
    ]
    assert scores == sorted(scores, reverse=True)

    high = client.get("/api/v1/staff/complaints?priority_level=high", headers=mayor).json()
    assert all(70 <= c["priority_score"] <= 89 for c in high["items"])

    overdue = client.get("/api/v1/staff/complaints?sla=overdue", headers=mayor).json()
    assert overdue["total"] > 0

    found = client.get("/api/v1/staff/complaints?q=underpass", headers=mayor).json()
    assert found["total"] == 1


# --- staff updates -----------------------------------------------------------


def test_assigning_moves_to_assigned_and_logs_timeline(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = staff_token(client, "officer.roads")
    officer_id = staff_id(client, roads, "roads")

    body = client.patch(
        f"/api/v1/staff/complaints/{complaint['id']}",
        json={"assigned_to_id": officer_id},
        headers=auth_header(roads),
    ).json()
    timeline = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}/timeline", headers=auth_header(roads)
    ).json()["items"]

    assert body["status"] == "assigned"
    assert body["assigned_to"]["id"] == officer_id
    assert [e["type"] for e in timeline] == ["created", "classified", "assigned", "status_changed"]


def test_cannot_assign_officer_from_other_department(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = staff_token(client, "officer.roads")
    water_officer = staff_id(client, roads, "water")

    response = client.patch(
        f"/api/v1/staff/complaints/{complaint['id']}",
        json={"assigned_to_id": water_officer},
        headers=auth_header(roads),
    )
    assert response.status_code == 400


def test_status_rules(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = auth_header(staff_token(client, "officer.roads"))
    url = f"/api/v1/staff/complaints/{complaint['id']}"

    skip = client.patch(url, json={"status": "in_progress"}, headers=roads)
    assert skip.status_code == 409

    client.patch(
        url,
        json={"assigned_to_id": staff_id(client, roads["Authorization"][7:], "roads")},
        headers=roads,
    )
    assert (
        client.patch(url, json={"status": "in_progress"}, headers=roads).json()["status"]
        == "in_progress"
    )

    resolve = client.patch(url, json={"status": "resolved"}, headers=roads)
    assert resolve.status_code == 409
    assert "after-photo" in resolve.json()["error"]["message"]


def test_reject_needs_reason(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = auth_header(staff_token(client, "officer.roads"))
    url = f"/api/v1/staff/complaints/{complaint['id']}"

    assert client.patch(url, json={"status": "rejected"}, headers=roads).status_code == 400
    body = client.patch(
        url, json={"status": "rejected", "note": "Private road"}, headers=roads
    ).json()
    assert body["status"] == "rejected"


def test_ward_rep_cannot_update(client, db):
    seed_demo(db)
    ward12 = auth_header(staff_token(client, "wardrep.12"))
    complaint = client.get("/api/v1/staff/complaints", headers=ward12).json()["items"][0]

    response = client.patch(
        f"/api/v1/staff/complaints/{complaint['id']}", json={"note": "hi"}, headers=ward12
    )
    assert response.status_code == 403


def test_reroute_moves_complaint_to_other_department(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = auth_header(staff_token(client, "officer.roads"))
    url = f"/api/v1/staff/complaints/{complaint['id']}"

    body = client.patch(url, json={"category": "garbage"}, headers=roads).json()

    assert body["department"] == "waste"
    assert client.get(url, headers=roads).status_code == 404
    waste = auth_header(staff_token(client, "officer.waste"))
    assert client.get(url, headers=waste).status_code == 200


def test_comment_is_added_to_timeline(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = auth_header(staff_token(client, "officer.roads"))

    client.post(
        f"/api/v1/staff/complaints/{complaint['id']}/comments",
        json={"note": "Material ordered"},
        headers=roads,
    )
    timeline = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}/timeline", headers=roads
    ).json()["items"]

    assert timeline[-1]["type"] == "comment"
    assert timeline[-1]["note"] == "Material ordered"
    assert timeline[-1]["actor"]["role"] == "officer"


def test_citizen_timeline_hides_internal_comments(client):
    token = citizen_token(client)
    complaint = submit(client, token, category="pothole")
    roads = auth_header(staff_token(client, "officer.roads"))
    client.post(
        f"/api/v1/staff/complaints/{complaint['id']}/comments",
        json={"note": "Internal: contractor delayed"},
        headers=roads,
    )

    timeline = client.get(
        f"/api/v1/citizen/complaints/{complaint['id']}/timeline", headers=auth_header(token)
    ).json()["items"]

    assert [e["type"] for e in timeline] == ["created", "classified"]
