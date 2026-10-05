from datetime import UTC, datetime, timedelta

import pytest

from app.agents.gemini import AnnouncementText, Translations
from tests.conftest import auth_header
from tests.test_complaints import citizen_token, staff_token, submit
from tests.test_realtime import EXPO_TOKEN, register_device, sent  # noqa: F401 (fixture)

RAJARAMPURI = {"lat": "16.6969", "lng": "74.2531"}  # ward 12


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)


@pytest.fixture
def wards(client):
    return {w["number"]: w["id"] for w in client.get("/api/v1/wards").json()["items"]}


def citizen_in_ward(client, ward_id, phone="+919811111111", language="en"):
    token = citizen_token(client, phone)
    client.patch(
        "/api/v1/auth/me",
        json={"ward_id": ward_id, "language": language},
        headers=auth_header(token),
    )
    return token


def post(client, token, **body):
    defaults = {
        "title_en": "Water supply delayed",
        "message_en": "Supply delayed by 2 hours today.",
    }
    return client.post(
        "/api/v1/announcements", json={**defaults, **body}, headers=auth_header(token)
    )


def feed(client, token):
    return [
        a["id"]
        for a in client.get("/api/v1/announcements", headers=auth_header(token)).json()["items"]
    ]


# --- who may post where ------------------------------------------------------


def test_officer_posts_for_own_department(client, wards):
    water = staff_token(client, "officer.water")
    response = post(client, water, department="water", ward_ids=[wards[12]], priority="important")
    body = response.json()

    assert response.status_code == 201
    assert body["title"] == {"en": "Water supply delayed", "mr": None, "hi": None}
    assert body["status"] == "published"
    assert body["author"]["role"] == "officer"


@pytest.mark.parametrize(
    ("username", "body"),
    [
        ("officer.water", {"department": "roads", "ward_ids": "W12"}),  # other department
        ("officer.water", {"department": "water", "city_wide": True}),  # city-wide
        ("wardrep.12", {"ward_ids": "W7"}),  # other ward
    ],
)
def test_posting_outside_own_scope_is_forbidden(client, wards, username, body):
    if "ward_ids" in body:  # "W12" -> [id of ward 12]
        body = {**body, "ward_ids": [wards[int(body["ward_ids"][1:])]]}

    assert post(client, staff_token(client, username), **body).status_code == 403


def test_mayor_posts_city_wide(client):
    body = post(client, staff_token(client, "mayor"), city_wide=True, priority="emergency").json()

    assert body["city_wide"] is True
    assert body["ward_ids"] == []


def test_needs_a_ward_or_city_wide(client):
    response = post(client, staff_token(client, "mayor"))

    assert response.status_code == 400


# --- what citizens see -------------------------------------------------------


def test_citizen_feed_shows_own_ward_and_city_wide(client, wards):
    ward12 = post(client, staff_token(client, "wardrep.12"), ward_ids=[wards[12]]).json()["id"]
    ward7 = post(client, staff_token(client, "wardrep.7"), ward_ids=[wards[7]]).json()["id"]
    city = post(client, staff_token(client, "mayor"), city_wide=True).json()["id"]
    citizen = citizen_in_ward(client, wards[12])

    shown = feed(client, citizen)

    assert set(shown) == {ward12, city}
    assert ward7 not in shown


def test_expired_and_future_announcements_are_hidden(client, wards):
    rep = staff_token(client, "wardrep.12")
    now = datetime.now(UTC)
    post(
        client,
        rep,
        ward_ids=[wards[12]],
        valid_from=(now - timedelta(days=2)).isoformat(),
        valid_until=(now - timedelta(days=1)).isoformat(),
    )
    post(client, rep, ward_ids=[wards[12]], valid_from=(now + timedelta(days=1)).isoformat())
    current = post(client, rep, ward_ids=[wards[12]]).json()["id"]

    assert feed(client, citizen_in_ward(client, wards[12])) == [current]


def test_emergency_listed_first(client, wards):
    rep = staff_token(client, "wardrep.12")
    general = post(client, rep, ward_ids=[wards[12]]).json()["id"]
    emergency = post(client, rep, ward_ids=[wards[12]], priority="emergency").json()["id"]

    assert feed(client, citizen_in_ward(client, wards[12])) == [emergency, general]


# --- push --------------------------------------------------------------------


def test_important_announcement_pushes_in_each_language(client, wards, sent, monkeypatch):  # noqa: F811
    monkeypatch.setattr(
        "app.agents.gemini.translate_announcement",
        lambda title, message: Translations(
            mr=AnnouncementText(title="पाणीपुरवठा उशिरा", message="आज पाणी 2 तास उशिरा."),
            hi=AnnouncementText(title="जल आपूर्ति में देरी", message="आज पानी 2 घंटे देर से."),
        ),
    )
    marathi = citizen_in_ward(client, wards[12], language="mr")
    register_device(client, marathi)
    other_ward = citizen_in_ward(client, wards[7], phone="+919822222222")
    register_device(client, other_ward, device="ExponentPushToken[ward-7-phone]")

    body = post(
        client,
        staff_token(client, "officer.water"),
        department="water",
        ward_ids=[wards[12]],
        priority="important",
    ).json()

    assert body["title"]["mr"] == "पाणीपुरवठा उशिरा"
    assert [m["to"] for m in sent] == [EXPO_TOKEN]
    assert sent[0]["title"] == "पाणीपुरवठा उशिरा"
    assert sent[0]["data"]["type"] == "announcement"


def test_general_announcement_does_not_push(client, wards, sent):  # noqa: F811
    register_device(client, citizen_in_ward(client, wards[12]))
    post(client, staff_token(client, "wardrep.12"), ward_ids=[wards[12]], priority="general")

    assert sent == []


# --- AI drafts ---------------------------------------------------------------


def test_ai_draft_is_hidden_until_published(client, wards, sent, monkeypatch):  # noqa: F811
    monkeypatch.setattr(
        "app.agents.gemini.draft_announcement",
        lambda text, department: AnnouncementText(
            title="Water supply delayed in Ward 12",
            message="Due to pipeline repair, water will come 2 hours late today (8-10 AM).",
        ),
    )
    citizen = citizen_in_ward(client, wards[12])
    register_device(client, citizen)
    water = staff_token(client, "officer.water")

    draft = client.post(
        "/api/v1/announcements/draft",
        json={
            "text": "pipeline repair ward 12 water 2 hrs late 8-10",
            "department": "water",
            "ward_ids": [wards[12]],
            "priority": "important",
        },
        headers=auth_header(water),
    ).json()

    assert draft["status"] == "draft" and draft["ai_drafted"] is True
    assert draft["id"] not in feed(client, citizen)
    assert (
        client.get(f"/api/v1/announcements/{draft['id']}", headers=auth_header(citizen)).status_code
        == 404
    )
    assert draft["id"] in [
        a["id"]
        for a in client.get("/api/v1/announcements", headers=auth_header(water)).json()["items"]
    ]

    published = client.post(
        f"/api/v1/announcements/{draft['id']}/publish", headers=auth_header(water)
    ).json()

    assert published["status"] == "published"
    assert draft["id"] in feed(client, citizen)
    assert len(sent) == 1


def test_draft_without_gemini_uses_the_note(client, wards):
    body = client.post(
        "/api/v1/announcements/draft",
        json={"text": "Health camp on Sunday 9 AM at ward office", "ward_ids": [wards[12]]},
        headers=auth_header(staff_token(client, "wardrep.12")),
    ).json()

    assert body["message"]["en"] == "Health camp on Sunday 9 AM at ward office"
    assert body["ai_drafted"] is False


# --- linked complaints -------------------------------------------------------


def test_complaint_explained_by_announcement_gets_auto_reply(client, wards):
    post(
        client,
        staff_token(client, "officer.water"),
        department="water",
        ward_ids=[wards[12]],
        title_en="Planned shutdown",
        message_en="No water until 4 PM for pipeline work.",
        linked_categories=["no_water_supply"],
    )
    citizen = citizen_in_ward(client, wards[12])

    complaint = submit(client, citizen, category="no_water_supply", description="no water")
    timeline = client.get(
        f"/api/v1/citizen/complaints/{complaint['id']}/timeline", headers=auth_header(citizen)
    ).json()["items"]
    home = client.get("/api/v1/citizen/home", headers=auth_header(citizen)).json()

    assert timeline[-1]["type"] == "auto_reply"
    assert timeline[-1]["note"] == "Planned shutdown: No water until 4 PM for pipeline work."
    assert home["announcements"][0]["title"]["en"] == "Planned shutdown"


def test_analyze_shows_explaining_announcement(client, wards):
    post(
        client,
        staff_token(client, "officer.water"),
        department="water",
        ward_ids=[wards[12]],
        linked_categories=["no_water_supply"],
    )
    response = client.post(
        "/api/v1/citizen/complaints/analyze",
        data={**RAJARAMPURI, "description": "pani nahi"},
        files={"photo": ("p.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "image/png")},
        headers=auth_header(citizen_token(client)),
    )

    assert response.json()["active_announcement"]["title"]["en"] == "Water supply delayed"


# --- edit / delete -----------------------------------------------------------


def test_only_author_or_mayor_can_change(client, wards):
    created = post(client, staff_token(client, "wardrep.12"), ward_ids=[wards[12]]).json()
    url = f"/api/v1/announcements/{created['id']}"
    water = staff_token(client, "officer.water")
    mayor = staff_token(client, "mayor")

    assert client.patch(
        url, json={"priority": "important"}, headers=auth_header(water)
    ).status_code in (403, 404)
    assert (
        client.patch(url, json={"priority": "important"}, headers=auth_header(mayor)).json()[
            "priority"
        ]
        == "important"
    )
    assert (
        client.delete(url, headers=auth_header(staff_token(client, "wardrep.12"))).status_code
        == 204
    )
