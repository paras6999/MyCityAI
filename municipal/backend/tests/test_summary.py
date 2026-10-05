from datetime import UTC, datetime, timedelta

from app.models import Complaint
from tests.conftest import auth_header
from tests.test_complaints import citizen_token, staff_token, submit

MAHADWAR = {"lat": "16.6955", "lng": "74.2375"}  # ward 7 centre


def get(client, token, path, **params):
    response = client.get(f"/api/v1{path}", params=params, headers=auth_header(token))
    assert response.status_code == 200, response.json()
    return response.json()


def resolve(db, complaint_id, hours, rating=None):
    stored = db.get(Complaint, complaint_id)
    stored.status = "closed"
    stored.resolved_at = stored.created_at + timedelta(hours=hours)
    if rating:
        stored.feedback = {"action": "confirm", "rating": rating, "comment": None}
    db.commit()


def make_city(client, db):
    """Ward 12: 2 roads (1 closed in 10 h, rated 4) + 1 water; ward 7: 1 roads, overdue."""
    citizen = citizen_token(client)
    a = submit(client, citizen, category="pothole")
    submit(client, citizen, category="road_damage", description="broken road")
    submit(client, citizen, category="no_water_supply", description="no water")
    far = submit(client, citizen, category="pothole", description="pothole", **MAHADWAR)
    resolve(db, a["id"], hours=10, rating=4)
    stored = db.get(Complaint, far["id"])
    stored.sla_due_at = datetime.now(UTC) - timedelta(hours=1)
    db.commit()
    return a, far


def test_mayor_kpis(client, db):
    make_city(client, db)
    body = get(client, staff_token(client, "mayor"), "/staff/summary")

    assert body["open"] == 3
    assert body["overdue"] == 1
    assert body["resolved_this_week"] == 1
    assert body["avg_resolution_hours"] == 10.0
    assert body["satisfaction_avg"] == 4.0
    assert body["resolution_rate"] == 0.25
    assert body["escalated_to_me"] == 0


def test_officer_kpis_are_department_only(client, db):
    make_city(client, db)
    body = get(client, staff_token(client, "officer.water"), "/staff/summary")

    assert body["open"] == 1
    assert body["escalated_to_me"] is None


def test_department_ranking(client, db):
    make_city(client, db)
    items = get(client, staff_token(client, "mayor"), "/staff/summary/departments")["items"]

    assert [d["department"] for d in items] == ["roads", "water"]
    roads = items[0]
    assert roads["total"] == 3 and roads["resolved"] == 1 and roads["overdue"] == 1


def test_ward_heatmap_is_mayor_only(client, db):
    make_city(client, db)
    items = get(client, staff_token(client, "mayor"), "/staff/summary/wards")["items"]
    ward12 = next(w for w in items if w["number"] == 12)

    assert ward12["total"] == 3 and ward12["resolved"] == 1 and ward12["pending"] == 2
    assert ward12["lat"] is not None
    rep = staff_token(client, "wardrep.12")
    assert client.get("/api/v1/staff/summary/wards", headers=auth_header(rep)).status_code == 403


def test_ward_rep_categories_only_own_ward(client, db):
    make_city(client, db)
    items = get(client, staff_token(client, "wardrep.12"), "/staff/summary/categories")["items"]

    assert {c["category"]: c["count"] for c in items} == {
        "pothole": 1,
        "road_damage": 1,
        "no_water_supply": 1,
    }


# --- public ------------------------------------------------------------------


def test_public_stats_need_no_login_and_have_no_personal_data(client, db):
    make_city(client, db)
    year = datetime.now(UTC).year
    response = client.get("/api/v1/stats/public", params={"period": str(year)})
    body = response.json()

    assert response.status_code == 200
    assert body["total_complaints"] == 4
    assert body["resolved"] == 1
    assert body["satisfaction_avg"] == 4.0 and body["ratings_count"] == 1
    assert sum(m["received"] for m in body["monthly"]) == 4
    assert body["top_wards"][0]["number"] == 12
    text = response.text
    assert "+91" not in text and "phone" not in text and "description" not in text


def test_public_stats_period_validation(client):
    assert client.get("/api/v1/stats/public", params={"period": "2026-13"}).status_code == 400
    body = client.get("/api/v1/stats/public", params={"period": "2025-02"}).json()
    assert body["total_complaints"] == 0
    assert [m["month"] for m in body["monthly"]] == ["2025-02"]


def test_history_seed_fills_the_charts(client, db):
    from app.seed import seed_history

    assert seed_history(db) == 400
    assert seed_history(db) == 0  # only once
    body = get(client, staff_token(client, "mayor"), "/staff/summary/departments")
    assert len(body["items"]) == 6
    assert all(0 < d["resolution_rate"] <= 1 for d in body["items"])
