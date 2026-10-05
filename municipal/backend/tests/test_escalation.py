from datetime import UTC, datetime, timedelta

import pytest

from app.models import Complaint
from app.services import scheduler
from tests.conftest import auth_header
from tests.test_complaints import citizen_token, staff_token, submit


@pytest.fixture
def run_job(db, monkeypatch):
    monkeypatch.setattr("app.services.scheduler.SessionLocal", lambda: db)
    return scheduler.escalation_job


def overdue(db, complaint_id, hours=1):
    stored = db.get(Complaint, complaint_id)
    stored.sla_due_at = datetime.now(UTC) - timedelta(hours=hours)
    db.commit()


def staff_view(client, token, complaint_id):
    return client.get(f"/api/v1/staff/complaints/{complaint_id}", headers=auth_header(token)).json()


def inbox(client, token, **params):
    return [
        c["id"]
        for c in client.get(
            "/api/v1/staff/complaints",
            params={"escalated": "true", **params},
            headers=auth_header(token),
        ).json()["items"]
    ]


# --- automatic ---------------------------------------------------------------


def test_overdue_complaint_goes_to_ward_rep_then_mayor(client, db, run_job):
    complaint = submit(client, citizen_token(client), category="pothole")  # ward 12
    rep = staff_token(client, "wardrep.12")
    mayor = staff_token(client, "mayor")

    assert run_job() == 0  # not due yet
    overdue(db, complaint["id"])
    assert run_job() == 1

    body = staff_view(client, rep, complaint["id"])
    assert body["escalation_level"] == 1
    # the ward rep gets a fresh 24 h
    due = datetime.fromisoformat(body["sla_due_at"])
    assert timedelta(hours=23) < due - datetime.now(UTC) <= timedelta(hours=24)
    assert inbox(client, rep) == [complaint["id"]]
    assert inbox(client, mayor, escalation_level=2) == []

    overdue(db, complaint["id"])
    assert run_job() == 1

    assert staff_view(client, mayor, complaint["id"])["escalation_level"] == 2
    assert inbox(client, mayor, escalation_level=2) == [complaint["id"]]
    # already at the top: stays with the mayor
    overdue(db, complaint["id"])
    assert run_job() == 0

    timeline = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}/timeline", headers=auth_header(mayor)
    ).json()["items"]
    notes = [e["note"] for e in timeline if e["type"] == "escalated"]
    assert notes == [
        "Deadline missed: escalated to the ward representative",
        "Deadline missed: escalated to the mayor",
    ]


def test_resolved_complaints_are_not_escalated(client, db, run_job):
    complaint = submit(client, citizen_token(client), category="pothole")
    stored = db.get(Complaint, complaint["id"])
    stored.status = "rejected"
    db.commit()
    overdue(db, complaint["id"])

    assert run_job() == 0


def test_breach_is_counted_once(client, db, run_job):
    complaint = submit(client, citizen_token(client), category="pothole")
    overdue(db, complaint["id"])
    run_job()
    first = db.get(Complaint, complaint["id"]).sla_breached_at
    overdue(db, complaint["id"])
    run_job()

    assert first is not None
    assert db.get(Complaint, complaint["id"]).sla_breached_at == first


# --- manual ------------------------------------------------------------------


def test_officer_escalates_with_reason(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = staff_token(client, "officer.roads")

    response = client.post(
        f"/api/v1/staff/complaints/{complaint['id']}/escalate",
        json={"reason": "Needs extra budget"},
        headers=auth_header(roads),
    )

    assert response.status_code == 200
    assert response.json()["escalation_level"] == 1
    # ...but cannot push it further: that is the ward rep's call
    again = client.post(
        f"/api/v1/staff/complaints/{complaint['id']}/escalate",
        json={"reason": "Still waiting"},
        headers=auth_header(roads),
    )
    assert again.json()["error"]["code"] == "ALREADY_ESCALATED"

    rep = staff_token(client, "wardrep.12")
    to_mayor = client.post(
        f"/api/v1/staff/complaints/{complaint['id']}/escalate",
        json={"reason": "Two departments involved"},
        headers=auth_header(rep),
    )
    assert to_mayor.json()["escalation_level"] == 2


def test_escalate_needs_reason_and_staff_role(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    url = f"/api/v1/staff/complaints/{complaint['id']}/escalate"

    assert (
        client.post(
            url, json={"reason": ""}, headers=auth_header(staff_token(client, "officer.roads"))
        ).status_code
        == 400
    )
    assert (
        client.post(
            url, json={"reason": "x"}, headers=auth_header(staff_token(client, "mayor"))
        ).status_code
        == 403
    )


# --- reminders ---------------------------------------------------------------


def test_ward_rep_reminds_once_per_hour(client):
    citizen = citizen_token(client)
    complaint = submit(client, citizen, category="pothole")
    rep = staff_token(client, "wardrep.12")
    url = f"/api/v1/staff/complaints/{complaint['id']}/remind"

    first = client.post(url, json={"note": "Please fix before Friday"}, headers=auth_header(rep))
    second = client.post(url, json={}, headers=auth_header(rep))

    assert first.status_code == 200
    assert second.status_code == 429
    citizen_timeline = client.get(
        f"/api/v1/citizen/complaints/{complaint['id']}/timeline", headers=auth_header(citizen)
    ).json()["items"]
    assert "reminder" not in [e["type"] for e in citizen_timeline]


def test_officer_cannot_send_reminders(client):
    complaint = submit(client, citizen_token(client), category="pothole")

    response = client.post(
        f"/api/v1/staff/complaints/{complaint['id']}/remind",
        json={},
        headers=auth_header(staff_token(client, "officer.roads")),
    )

    assert response.status_code == 403
