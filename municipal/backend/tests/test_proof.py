from datetime import UTC, datetime, timedelta

import pytest

from app.agents.gemini import FixCheck
from app.models import Complaint
from app.services import scheduler
from tests.conftest import auth_header
from tests.test_complaints import PNG, citizen_token, staff_id, staff_token, submit
from tests.test_realtime import EXPO_TOKEN, register_device, sent  # noqa: F401 (fixture)
from tests.test_vision import pothole

AFTER_PNG = b"\x89PNG\r\n\x1a\n" + b"\x01" * 64  # a different image than the complaint photo


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)
    monkeypatch.setattr("app.routes.complaints_staff.media_root", lambda: tmp_path)


def in_progress_complaint(client, citizen=None, **fields):
    citizen = citizen or citizen_token(client)
    complaint = submit(client, citizen, category="pothole", **fields)
    roads = staff_token(client, "officer.roads")
    url = f"/api/v1/staff/complaints/{complaint['id']}"
    client.patch(
        url, json={"assigned_to_id": staff_id(client, roads, "roads")}, headers=auth_header(roads)
    )
    client.patch(url, json={"status": "in_progress"}, headers=auth_header(roads))
    return complaint, roads, citizen


def upload_proof(client, complaint_id, token, photo=AFTER_PNG, note="Pothole filled"):
    return client.post(
        f"/api/v1/staff/complaints/{complaint_id}/proof",
        data={"note": note},
        files={"after_photo": ("after.png", photo, "image/png")},
        headers=auth_header(token),
    )


# --- proof -------------------------------------------------------------------


def test_proof_without_ai_resolves_as_not_checked(client, sent):  # noqa: F811
    citizen = citizen_token(client)
    register_device(client, citizen)
    complaint, roads, _ = in_progress_complaint(client, citizen)

    body = upload_proof(client, complaint["id"], roads).json()

    verification = body["verification"]
    assert verification["ai_verified"] is None
    assert verification["method"] == "none"
    assert verification["reason"] == "AI could not check this repair; the citizen will confirm"
    # Test photos carry no location; with REQUIRE_LIVE_PHOTOS off this is recorded, not enforced.
    assert verification["photo_check"]["live"] is False
    assert "Photo has no location" in verification["photo_check"]["problems"]
    assert body["complaint"]["status"] == "resolved"
    assert body["complaint"]["resolved_at"] is not None
    assert body["complaint"]["proof"]["after_photo_url"].startswith(
        f"/media/complaints/{complaint['id']}/after-"
    )
    assert body["complaint"]["proof"]["note"] == "Pothole filled"
    assert sent[-1]["data"]["type"] == "feedback_request"
    assert sent[-1]["data"]["status"] == "resolved"


def test_same_photo_is_rejected(client):
    complaint, roads, _ = in_progress_complaint(client)

    body = upload_proof(client, complaint["id"], roads, photo=PNG).json()

    assert body["verification"]["ai_verified"] is False
    assert body["verification"]["method"] == "identical"
    assert body["complaint"]["status"] == "in_progress"


def test_yolo_rejects_when_pothole_still_visible(client, monkeypatch):
    complaint, roads, _ = in_progress_complaint(client)
    monkeypatch.setattr("app.agents.vision.supported_categories", lambda: {"pothole"})
    monkeypatch.setattr("app.agents.vision.detect", lambda image: [pothole(0.88)])

    body = upload_proof(client, complaint["id"], roads).json()

    assert body["verification"]["ai_verified"] is False
    assert body["verification"]["reason"] == "Pothole still visible (88%)"
    assert body["complaint"]["status"] == "in_progress"
    timeline = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}/timeline", headers=auth_header(roads)
    ).json()["items"]
    assert timeline[-1]["note"].startswith("AI check: not fixed")


def test_yolo_verifies_when_pothole_gone(client, monkeypatch):
    complaint, roads, _ = in_progress_complaint(client)
    monkeypatch.setattr("app.agents.vision.supported_categories", lambda: {"pothole"})
    monkeypatch.setattr(
        "app.agents.vision.detect", lambda image: [pothole(0.9)] if image == PNG else []
    )

    body = upload_proof(client, complaint["id"], roads).json()

    assert body["verification"]["ai_verified"] is True
    assert body["verification"]["method"] == "yolo"
    assert body["complaint"]["status"] == "resolved"


@pytest.mark.parametrize(("fixed", "status"), [(True, "resolved"), (False, "in_progress")])
def test_gemini_compares_before_and_after(client, monkeypatch, fixed, status):
    complaint, roads, _ = in_progress_complaint(client)
    monkeypatch.setattr(
        "app.agents.gemini.check_fix",
        lambda *args: FixCheck(fixed=fixed, confidence=0.8, reason="Compared photos"),
    )

    body = upload_proof(client, complaint["id"], roads).json()

    assert body["verification"]["method"] == "gemini"
    assert body["complaint"]["status"] == status


def test_proof_needs_work_started(client):
    complaint = submit(client, citizen_token(client), category="pothole")
    roads = staff_token(client, "officer.roads")

    assert upload_proof(client, complaint["id"], roads).status_code == 409


def test_ward_rep_cannot_upload_proof(client):
    complaint, _, _ = in_progress_complaint(client, lat="16.6969", lng="74.2531")
    ward12 = staff_token(client, "wardrep.12")

    assert upload_proof(client, complaint["id"], ward12).status_code == 403


# --- citizen feedback --------------------------------------------------------


def resolved_complaint(client):
    complaint, roads, citizen = in_progress_complaint(client)
    upload_proof(client, complaint["id"], roads)
    return complaint, roads, citizen


def feedback(client, complaint_id, token, **body):
    return client.post(
        f"/api/v1/citizen/complaints/{complaint_id}/feedback", json=body, headers=auth_header(token)
    )


def test_citizen_confirms_and_rates(client):
    complaint, _, citizen = resolved_complaint(client)

    body = feedback(
        client, complaint["id"], citizen, action="confirm", rating=5, comment="Thanks!"
    ).json()

    assert body["status"] == "closed"
    assert body["feedback"]["action"] == "confirm"
    assert body["feedback"]["rating"] == 5


def test_citizen_reopens_and_officer_redoes_work(client):
    complaint, roads, citizen = resolved_complaint(client)

    assert feedback(client, complaint["id"], citizen, action="reopen").status_code == 400
    body = feedback(
        client, complaint["id"], citizen, action="reopen", comment="Pothole is back after rain"
    ).json()
    assert body["status"] == "reopened"
    assert body["resolved_at"] is None

    url = f"/api/v1/staff/complaints/{complaint['id']}"
    again = client.patch(url, json={"status": "in_progress"}, headers=auth_header(roads)).json()
    assert again["status"] == "in_progress"
    assert upload_proof(client, complaint["id"], roads).json()["complaint"]["status"] == "resolved"


def test_feedback_rules(client):
    complaint, _, citizen = in_progress_complaint(client)
    assert feedback(client, complaint["id"], citizen, action="confirm").status_code == 409

    resolved, _, _ = resolved_complaint(client)
    stranger = citizen_token(client, "+919899999999")
    assert feedback(client, resolved["id"], stranger, action="confirm").status_code == 404


# --- auto-close --------------------------------------------------------------


def test_auto_close_after_72_hours(client, db, monkeypatch):
    complaint, roads, _ = resolved_complaint(client)
    fresh, _, _ = resolved_complaint(client)
    stored = db.get(Complaint, complaint["id"])
    stored.resolved_at = datetime.now(UTC) - timedelta(hours=73)
    db.commit()
    monkeypatch.setattr("app.services.scheduler.SessionLocal", lambda: db)

    assert scheduler.auto_close_job() == 1

    body = client.get(
        f"/api/v1/staff/complaints/{complaint['id']}", headers=auth_header(roads)
    ).json()
    assert body["status"] == "closed"
    assert body["feedback"]["action"] == "auto_closed"
    still_open = client.get(f"/api/v1/staff/complaints/{fresh['id']}", headers=auth_header(roads))
    assert still_open.json()["status"] == "resolved"


# --- same-place check --------------------------------------------------------


def test_different_place_downgrades_yolo_verdict(client, monkeypatch):
    complaint, roads, _ = in_progress_complaint(client)
    monkeypatch.setattr("app.agents.vision.supported_categories", lambda: {"pothole"})
    monkeypatch.setattr(
        "app.agents.vision.detect", lambda image: [pothole(0.9)] if image == PNG else []
    )
    monkeypatch.setattr("app.agents.scene.same_place", lambda before, after: False)

    body = upload_proof(client, complaint["id"], roads).json()

    assert body["verification"]["ai_verified"] is None
    assert "same place" in body["verification"]["reason"]
    assert body["complaint"]["status"] == "resolved"  # citizen's confirmation decides


def test_scene_matcher_separates_same_and_different_places():
    cv2 = pytest.importorskip("cv2")
    import numpy as np

    from app.agents import scene

    def textured(seed):
        rng = np.random.default_rng(seed)
        img = np.full((600, 800, 3), 128, np.uint8)
        for _ in range(150):  # random shapes give plenty of corners to match
            x, y = rng.integers(0, 800), rng.integers(0, 600)
            colour = tuple(int(c) for c in rng.integers(0, 255, 3))
            cv2.rectangle(
                img,
                (x, y),
                (x + int(rng.integers(10, 80)), y + int(rng.integers(10, 80))),
                colour,
                -1,
            )
        return img

    def encode(img):
        return cv2.imencode(".jpg", img)[1].tobytes()

    before = textured(1)
    repaired = before.copy()
    cv2.rectangle(repaired, (300, 350), (500, 500), (110, 110, 110), -1)  # "filled pothole"
    reshot = cv2.convertScaleAbs(repaired[30:570, 40:760], alpha=1.1, beta=10)

    assert scene.same_place(encode(before), encode(reshot)) is True
    assert scene.same_place(encode(before), encode(textured(2))) is False
