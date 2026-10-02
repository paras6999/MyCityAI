from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.core.security import JWT_ALGORITHM, require_role
from app.models import OtpCode, User
from tests.conftest import DEV_OTP, SEED_PASSWORD, auth_header

PHONE = "+919876543210"


def citizen_login(client: TestClient, phone: str = PHONE) -> dict:
    assert client.post("/api/v1/auth/otp/request", json={"phone": phone}).status_code == 200
    response = client.post("/api/v1/auth/otp/verify", json={"phone": phone, "otp": DEV_OTP})
    assert response.status_code == 200, response.json()
    return response.json()


def staff_login(client: TestClient, username: str) -> dict:
    response = client.post(
        "/api/v1/auth/login", json={"username": username, "password": SEED_PASSWORD}
    )
    assert response.status_code == 200, response.json()
    return response.json()


# --- citizen OTP -------------------------------------------------------------


def test_otp_creates_citizen_on_first_login(client):
    body = citizen_login(client)

    assert body["is_new_user"] is True
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "citizen"
    assert body["user"]["phone"] == PHONE
    assert datetime.fromisoformat(body["user"]["created_at"]).tzinfo is not None


def test_otp_second_login_is_not_new_user(client, db):
    citizen_login(client)
    db.query(OtpCode).delete()  # skip the resend cooldown
    db.commit()

    assert citizen_login(client)["is_new_user"] is False


def test_wrong_otp_is_rejected_then_rate_limited(client):
    client.post("/api/v1/auth/otp/request", json={"phone": PHONE})
    for _ in range(get_settings().otp_max_attempts):
        response = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": "000000"})
        assert response.json()["error"]["code"] == "OTP_INVALID"

    response = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": DEV_OTP})
    assert response.status_code == 429


def test_otp_resend_too_soon_is_rate_limited(client):
    client.post("/api/v1/auth/otp/request", json={"phone": PHONE})
    response = client.post("/api/v1/auth/otp/request", json={"phone": PHONE})

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMITED"


def test_expired_otp_is_rejected(client, db):
    client.post("/api/v1/auth/otp/request", json={"phone": PHONE})
    record = db.get(OtpCode, PHONE)
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    response = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": DEV_OTP})
    assert response.json()["error"]["code"] == "OTP_EXPIRED"


def test_invalid_phone_returns_validation_error(client):
    response = client.post("/api/v1/auth/otp/request", json={"phone": "98765"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["details"][0]["field"] == "phone"


# --- staff login -------------------------------------------------------------


@pytest.mark.parametrize(
    ("username", "role"),
    [
        ("officer.water", "officer"),
        ("wardrep.12", "ward_rep"),
        ("mayor", "mayor"),
        ("admin", "admin"),
    ],
)
def test_staff_login_returns_role(client, username, role):
    body = staff_login(client, username)

    assert body["user"]["role"] == role
    assert "is_new_user" not in body


def test_officer_token_carries_department(client):
    body = staff_login(client, "officer.water")
    payload = jwt.decode(
        body["access_token"], get_settings().jwt_secret, algorithms=[JWT_ALGORITHM]
    )

    assert payload["role"] == "officer"
    assert payload["department"] == "water"
    assert payload["type"] == "access"


def test_staff_login_wrong_password(client):
    response = client.post("/api/v1/auth/login", json={"username": "mayor", "password": "wrong"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


# --- tokens ------------------------------------------------------------------


def test_me_requires_token(client):
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_returns_current_user(client):
    body = staff_login(client, "wardrep.12")
    response = client.get("/api/v1/auth/me", headers=auth_header(body["access_token"]))

    assert response.status_code == 200
    assert response.json()["role"] == "ward_rep"


def test_refresh_token_cannot_be_used_as_access_token(client):
    body = staff_login(client, "mayor")
    response = client.get("/api/v1/auth/me", headers=auth_header(body["refresh_token"]))

    assert response.status_code == 401


def test_expired_access_token(client):
    token = jwt.encode(
        {"sub": "1", "type": "access", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        get_settings().jwt_secret,
        algorithm=JWT_ALGORITHM,
    )
    response = client.get("/api/v1/auth/me", headers=auth_header(token))

    assert response.json()["error"]["code"] == "TOKEN_EXPIRED"


def test_refresh_issues_new_tokens(client):
    body = staff_login(client, "mayor")
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "mayor"


# --- profile -----------------------------------------------------------------


def test_citizen_can_set_ward_and_language(client):
    token = citizen_login(client)["access_token"]
    response = client.patch(
        "/api/v1/auth/me",
        json={"name": "Ravi P.", "ward_id": 12, "language": "mr"},
        headers=auth_header(token),
    )

    assert response.status_code == 200
    assert response.json()["ward_id"] == 12
    assert response.json()["language"] == "mr"


def test_citizen_cannot_pick_unknown_ward(client):
    token = citizen_login(client)["access_token"]
    response = client.patch("/api/v1/auth/me", json={"ward_id": 999}, headers=auth_header(token))

    assert response.status_code == 400


def test_staff_cannot_change_own_ward(client):
    token = staff_login(client, "wardrep.12")["access_token"]
    response = client.patch("/api/v1/auth/me", json={"ward_id": 7}, headers=auth_header(token))

    assert response.status_code == 403


# --- roles & wards -----------------------------------------------------------


def test_require_role_blocks_other_roles(client):
    guarded = FastAPI()
    register_error_handlers(guarded)

    @guarded.get("/mayor-only")
    def mayor_only(user: Annotated[User, Depends(require_role("mayor"))]):
        return {"ok": True}

    guarded.dependency_overrides = client.app.dependency_overrides
    guarded_client = TestClient(guarded)
    officer = staff_login(client, "officer.roads")["access_token"]
    mayor = staff_login(client, "mayor")["access_token"]

    assert guarded_client.get("/mayor-only", headers=auth_header(officer)).status_code == 403
    assert guarded_client.get("/mayor-only", headers=auth_header(mayor)).status_code == 200


def test_wards_list_includes_rep(client):
    items = client.get("/api/v1/wards").json()["items"]

    assert len(items) == 20
    ward_12 = next(w for w in items if w["number"] == 12)
    assert ward_12["name"] == "Rajarampuri"
    assert ward_12["rep_user_id"] is not None
