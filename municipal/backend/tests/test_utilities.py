from datetime import UTC, datetime, timedelta

import pytest

from app.agents import forecast, utilities
from app.services import sensor_sim as sim
from app.simulate_sensors import setup
from tests.conftest import auth_header
from tests.test_complaints import citizen_token, staff_token, submit

KEY = {"X-Sensor-Key": "dev-sensor-key"}


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)


@pytest.fixture
def sensors(db):
    """Ward 12 water + power sensors with 30 days of normal history."""
    setup(db, days=30, ward_numbers=[12])


def send(client, kind="water_flow", percent=0.0, hours=6):
    simulated = sim.make_sensor(kind, 12)
    readings = []
    for ts in sim.hours_back(datetime.now(UTC), hours):
        value = sim.normal_value(simulated, ts)
        if percent > 0:
            value += sim.leak_extra(simulated, percent)
        elif percent < 0:
            value *= 1 + percent / 100
        readings.append({"sensor": simulated.code, "ts": ts.isoformat(), "value": value})
    response = client.post("/api/v1/sensors/readings", json={"readings": readings}, headers=KEY)
    assert response.status_code == 200, response.json()
    return response.json()


def suggestions(client, username):
    response = client.get(
        "/api/v1/staff/ai-suggestions", headers=auth_header(staff_token(client, username))
    )
    return response.json()["items"]


# --- ingestion ---------------------------------------------------------------


def test_readings_need_the_sensor_key(client, sensors):
    body = {"readings": [{"sensor": "W12-FLOW", "ts": datetime.now(UTC).isoformat(), "value": 1}]}

    assert client.post("/api/v1/sensors/readings", json=body).status_code == 401
    wrong = {"X-Sensor-Key": "nope"}
    assert client.post("/api/v1/sensors/readings", json=body, headers=wrong).status_code == 401


def test_unknown_sensor_is_rejected(client, sensors):
    body = {"readings": [{"sensor": "X99", "ts": datetime.now(UTC).isoformat(), "value": 1}]}

    response = client.post("/api/v1/sensors/readings", json=body, headers=KEY)

    assert response.json()["error"]["code"] == "UNKNOWN_SENSOR"


def test_normal_readings_raise_nothing(client, sensors):
    assert send(client)["suggestions"] == []
    assert send(client, kind="power_load")["suggestions"] == []


# --- anomalies ---------------------------------------------------------------


def test_leak_creates_suggestion_for_water_department(client, sensors):
    result = send(client, percent=40)

    assert len(result["suggestions"]) == 1
    [item] = suggestions(client, "officer.water")
    assert item["type"] == "anomaly"
    assert item["title"] == "Possible leak / illegal connection in Ward 12 (Rajarampuri)"
    assert "above normal" in item["body"]
    assert item["ref"]["direction"] == "up"
    # same ward rep sees it, other departments / wards do not
    assert len(suggestions(client, "wardrep.12")) == 1
    assert suggestions(client, "officer.electricity") == []
    assert suggestions(client, "wardrep.7") == []


def test_continuing_leak_updates_one_suggestion(client, sensors):
    first = send(client, percent=40)["suggestions"]
    second = send(client, percent=45)["suggestions"]

    assert first == second
    assert len(suggestions(client, "mayor")) == 1


def test_power_drop_is_a_possible_outage(client, sensors):
    send(client, kind="power_load", percent=-80)

    [item] = suggestions(client, "officer.electricity")
    assert item["title"].startswith("Possible power outage")


def test_dismiss_hides_suggestion(client, sensors):
    [suggestion_id] = send(client, percent=40)["suggestions"]
    water = staff_token(client, "officer.water")

    response = client.post(
        f"/api/v1/staff/ai-suggestions/{suggestion_id}/dismiss", headers=auth_header(water)
    )

    assert response.status_code == 204
    assert suggestions(client, "officer.water") == []


def test_work_order_creates_sensor_complaint(client, sensors):
    [suggestion_id] = send(client, percent=40)["suggestions"]
    water = auth_header(staff_token(client, "officer.water"))
    url = f"/api/v1/staff/ai-suggestions/{suggestion_id}/work-order"

    response = client.post(url, headers=water)
    complaint = response.json()

    assert response.status_code == 201
    assert complaint["source"] == "sensor"
    assert complaint["category"] == "water_leakage"
    assert complaint["department"] == "water"
    assert complaint["ai"]["forecast_risk"] == 1.0
    assert complaint["ai"]["model"] == "utilities"
    assert complaint["reporter"] is None
    assert client.post(url, headers=water).status_code == 409
    queue = client.get("/api/v1/staff/complaints", headers=water).json()["items"]
    assert complaint["id"] in [c["id"] for c in queue]


def test_ward_rep_cannot_create_work_orders(client, sensors):
    [suggestion_id] = send(client, percent=40)["suggestions"]
    rep = auth_header(staff_token(client, "wardrep.12"))

    response = client.post(f"/api/v1/staff/ai-suggestions/{suggestion_id}/work-order", headers=rep)

    assert response.status_code == 403


# --- sensors & forecast ----------------------------------------------------------


def test_sensor_list_is_scoped_and_shows_anomaly(client, sensors):
    send(client, percent=40)
    water = auth_header(staff_token(client, "officer.water"))

    items = client.get("/api/v1/staff/utilities/sensors", headers=water).json()["items"]

    assert [s["code"] for s in items] == ["W12-FLOW"]
    assert items[0]["status"] == "anomaly"
    assert items[0]["forecast_peak"] > 0
    mayor = auth_header(staff_token(client, "mayor"))
    assert len(client.get("/api/v1/staff/utilities/sensors", headers=mayor).json()["items"]) == 2


def test_sensor_detail_has_expected_values_and_forecast(client, sensors):
    water = auth_header(staff_token(client, "officer.water"))
    [sensor] = client.get("/api/v1/staff/utilities/sensors", headers=water).json()["items"]

    body = client.get(
        f"/api/v1/staff/utilities/sensors/{sensor['id']}?hours=48", headers=water
    ).json()

    assert 47 <= len(body["readings"]) <= 49
    assert all(r["expected"] is not None for r in body["readings"])
    assert body["forecast"]["method"] == "seasonal"
    assert len(body["forecast"]["points"]) == 24
    electricity = auth_header(staff_token(client, "officer.electricity"))
    other = client.get(f"/api/v1/staff/utilities/sensors/{sensor['id']}", headers=electricity)
    assert other.status_code == 404


def test_seasonal_forecast_is_close_to_simulated_truth():
    simulated = sim.make_sensor("water_flow", 3)
    now = sim.hour_floor(datetime.now(UTC))
    history = {ts: sim.normal_value(simulated, ts) for ts in sim.hours_back(now, 28 * 24)}

    result = forecast.forecast(history)
    errors = [
        abs(value - sim.normal_value(simulated, ts)) / sim.normal_value(simulated, ts)
        for ts, value in result.points
    ]

    assert result.points[0][0] == now + timedelta(hours=1)
    assert sum(errors) / len(errors) < 0.1  # mean error under 10 %


def test_capacity_risk():
    assert utilities.capacity_risk(80, 100) == 0
    assert utilities.capacity_risk(92.5, 100) == 0.5
    assert utilities.capacity_risk(120, 100) == 1


# --- priority ----------------------------------------------------------------


def test_open_anomaly_raises_priority_of_matching_complaints(client, sensors):
    citizen = citizen_token(client)
    before = submit(client, citizen, category="no_water_supply", description="no water")
    send(client, percent=40)

    after = submit(
        client,
        citizen_token(client, "+919822222222"),
        category="no_water_supply",
        description="no water",
        lat="16.6990",  # ~300 m away: same ward, not a duplicate
        lng="74.2550",
    )
    roads = submit(client, citizen, category="pothole", description="pothole")

    water = auth_header(staff_token(client, "officer.water"))
    detail = client.get(f"/api/v1/staff/complaints/{after['id']}", headers=water).json()
    assert detail["ai"]["forecast_risk"] == 1.0
    first = client.get(f"/api/v1/staff/complaints/{before['id']}", headers=water).json()
    assert first["ai"]["forecast_risk"] == 0  # normal demand, well below capacity
    assert detail["priority_score"] == first["priority_score"] + 10
    roads_detail = client.get(
        f"/api/v1/staff/complaints/{roads['id']}",
        headers=auth_header(staff_token(client, "officer.roads")),
    ).json()
    assert roads_detail["ai"]["forecast_risk"] == 0
