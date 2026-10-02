import pytest
from starlette.websockets import WebSocketDisconnect

from app.models import DeviceToken
from app.services.realtime import Viewer
from tests.conftest import auth_header
from tests.test_complaints import citizen_token, staff_id, staff_token, submit

EXPO_TOKEN = "ExponentPushToken[test-device-1]"


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)


@pytest.fixture
def sent(monkeypatch):
    """Capture messages that would go to the Expo push service."""
    messages: list[dict] = []

    def fake_send(batch):
        messages.extend(batch)
        return [{"status": "ok"} for _ in batch]

    monkeypatch.setattr("app.services.push.send_expo", fake_send)
    return messages


def register_device(client, token: str, device: str = EXPO_TOKEN):
    return client.post(
        "/api/v1/auth/device-token",
        json={"token": device, "platform": "android"},
        headers=auth_header(token),
    )


# --- device tokens -----------------------------------------------------------


def test_register_device_token(client, db):
    token = citizen_token(client)

    assert register_device(client, token).status_code == 204
    assert register_device(client, token).status_code == 204  # idempotent
    assert db.query(DeviceToken).count() == 1


def test_device_token_moves_to_new_user(client, db):
    register_device(client, citizen_token(client, "+919811111111"))
    second = citizen_token(client, "+919822222222")
    register_device(client, second)
    second_id = client.get("/api/v1/auth/me", headers=auth_header(second)).json()["id"]

    devices = db.query(DeviceToken).all()
    assert [d.user_id for d in devices] == [second_id]


def test_rejects_non_expo_token(client):
    response = register_device(client, citizen_token(client), device="raw-fcm-token")

    assert response.status_code == 400


def test_unregister_device_token(client, db):
    token = citizen_token(client)
    register_device(client, token)
    response = client.request(
        "DELETE",
        "/api/v1/auth/device-token",
        json={"token": EXPO_TOKEN, "platform": "android"},
        headers=auth_header(token),
    )

    assert response.status_code == 204
    assert db.query(DeviceToken).count() == 0


# --- push on status change ---------------------------------------------------


def test_status_change_pushes_to_reporter(client, sent):
    citizen = citizen_token(client)
    register_device(client, citizen)
    complaint = submit(client, citizen, category="pothole")
    roads = staff_token(client, "officer.roads")

    client.patch(
        f"/api/v1/staff/complaints/{complaint['id']}",
        json={"assigned_to_id": staff_id(client, roads, "roads")},
        headers=auth_header(roads),
    )

    assert len(sent) == 1
    message = sent[0]
    assert message["to"] == EXPO_TOKEN
    assert complaint["code"] in message["body"]
    assert message["data"] == {
        "type": "complaint_status",
        "complaint_id": str(complaint["id"]),
        "status": "assigned",
        "title": f"Complaint {complaint['code']}",
        "body": message["body"],
    }


def test_push_uses_citizen_language(client, sent):
    citizen = citizen_token(client)
    client.patch("/api/v1/auth/me", json={"language": "mr"}, headers=auth_header(citizen))
    register_device(client, citizen)
    complaint = submit(client, citizen, category="pothole")
    roads = auth_header(staff_token(client, "officer.roads"))

    client.patch(
        f"/api/v1/staff/complaints/{complaint['id']}",
        json={"status": "rejected", "note": "Private road"},
        headers=roads,
    )

    assert "नाकारली" in sent[0]["body"]
    assert "Private road" in sent[0]["body"]


def test_comment_does_not_push(client, sent):
    citizen = citizen_token(client)
    register_device(client, citizen)
    complaint = submit(client, citizen, category="pothole")

    client.patch(
        f"/api/v1/staff/complaints/{complaint['id']}",
        json={"note": "internal"},
        headers=auth_header(staff_token(client, "officer.roads")),
    )

    assert sent == []


def test_dead_device_tokens_are_removed(client, db, monkeypatch):
    citizen = citizen_token(client)
    register_device(client, citizen)
    complaint = submit(client, citizen, category="pothole")
    monkeypatch.setattr(
        "app.services.push.send_expo",
        lambda batch: [{"status": "error", "details": {"error": "DeviceNotRegistered"}}],
    )
    monkeypatch.setattr("app.services.push.SessionLocal", lambda: db)

    client.patch(
        f"/api/v1/staff/complaints/{complaint['id']}",
        json={"status": "rejected", "note": "Duplicate"},
        headers=auth_header(staff_token(client, "officer.roads")),
    )

    assert db.query(DeviceToken).count() == 0


# --- WebSocket ---------------------------------------------------------------


def test_dashboard_receives_new_complaint(client):
    roads = staff_token(client, "officer.roads")

    with client.websocket_connect(f"/ws/dashboard?token={roads}") as socket:
        complaint = submit(client, citizen_token(client), category="pothole")
        message = socket.receive_json()

    assert message["event"] == "complaint.created"
    assert message["data"]["id"] == complaint["id"]
    assert message["data"]["reporter"]["phone_masked"]  # staff view of the complaint


def test_dashboard_receives_updates(client):
    roads = staff_token(client, "officer.roads")
    complaint = submit(client, citizen_token(client), category="pothole")

    with client.websocket_connect(f"/ws/dashboard?token={roads}") as socket:
        client.post(
            f"/api/v1/staff/complaints/{complaint['id']}/comments",
            json={"note": "Material ordered"},
            headers=auth_header(roads),
        )
        message = socket.receive_json()

    assert message["event"] == "complaint.updated"
    assert message["data"]["id"] == complaint["id"]


def test_socket_rejects_invalid_token(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/dashboard?token=not-a-token"):
            pass
    assert exc.value.code == 4401


def test_socket_rejects_citizens(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws/dashboard?token={citizen_token(client)}"):
            pass
    assert exc.value.code == 4403


@pytest.mark.parametrize(
    ("viewer", "department", "ward_id", "expected"),
    [
        (Viewer(1, "officer", "roads", None), "roads", 5, True),
        (Viewer(1, "officer", "roads", None), "water", 5, False),
        (Viewer(2, "ward_rep", None, 12), "water", 12, True),
        (Viewer(2, "ward_rep", None, 12), "water", 7, False),
        (Viewer(3, "mayor", None, None), "waste", 3, True),
    ],
)
def test_events_are_scoped_like_the_queue(viewer, department, ward_id, expected):
    assert viewer.can_see(department, ward_id) is expected
