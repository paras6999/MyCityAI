import io
from datetime import UTC, datetime, timedelta

import pytest
from PIL import ExifTags, Image

from app.core.config import get_settings
from app.services import live_photo
from tests.conftest import auth_header
from tests.test_complaints import citizen_token, staff_id, staff_token
from tests.test_vision import pothole

SPOT = (16.69690, 74.25310)  # where the citizen stands
NEAR = (16.69700, 74.25320)  # ~15 m away
FAR = (16.70500, 74.24000)  # ~1.6 km away
IST = 330  # minutes


def dms(value: float):
    value = abs(value)
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = round((value - degrees - minutes / 60) * 3600, 4)
    return (degrees, minutes, seconds)


def camera_jpeg(
    lat: float | None = None,
    lng: float | None = None,
    taken: datetime | None = None,
    offset: str | None = "+05:30",
    seed: int = 0,
) -> bytes:
    """A JPEG like a phone camera makes: GPS + capture time in EXIF."""
    picture = Image.new("RGB", (64, 48), (90 + seed, 90, 90))
    exif = Image.Exif()
    if lat is not None and lng is not None:
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        gps[ExifTags.GPS.GPSLatitudeRef] = "N" if lat >= 0 else "S"
        gps[ExifTags.GPS.GPSLatitude] = dms(lat)
        gps[ExifTags.GPS.GPSLongitudeRef] = "E" if lng >= 0 else "W"
        gps[ExifTags.GPS.GPSLongitude] = dms(lng)
    if taken is not None:
        local = taken.astimezone(UTC) + timedelta(minutes=IST)
        details = exif.get_ifd(ExifTags.IFD.Exif)
        details[ExifTags.Base.DateTimeOriginal] = local.strftime("%Y:%m:%d %H:%M:%S")
        if offset:
            details[ExifTags.Base.OffsetTimeOriginal] = offset
    out = io.BytesIO()
    picture.save(out, format="JPEG", exif=exif)
    return out.getvalue()


def now() -> datetime:
    return datetime.now(UTC)


@pytest.fixture(autouse=True)
def media_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.media.media_root", lambda: tmp_path)
    monkeypatch.setattr("app.routes.complaints_staff.media_root", lambda: tmp_path)


@pytest.fixture
def strict(monkeypatch):
    monkeypatch.setattr(get_settings(), "require_live_photos", True)


# --- reading EXIF ------------------------------------------------------------


def test_reads_gps_and_time_from_exif():
    taken = now().replace(microsecond=0)
    info = live_photo.read_exif(camera_jpeg(*SPOT, taken=taken))

    assert info.lat == pytest.approx(SPOT[0], abs=1e-5)
    assert info.lng == pytest.approx(SPOT[1], abs=1e-5)
    assert info.taken_at == taken


def test_exif_time_without_offset_is_treated_as_ist():
    taken = now().replace(microsecond=0)
    info = live_photo.read_exif(camera_jpeg(taken=taken, offset=None))

    assert info.taken_at == taken


def test_photo_without_exif():
    info = live_photo.read_exif(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)

    assert (info.lat, info.lng, info.taken_at) == (None, None, None)


# --- rules -------------------------------------------------------------------


def check(image, **kwargs):
    defaults = {
        "lat": SPOT[0],
        "lng": SPOT[1],
        "captured_at": None,
        "accuracy_m": None,
        "capture_source": "camera",
    }
    return live_photo.check_live_photo(image, **{**defaults, **kwargs})


def test_fresh_geotagged_camera_photo_is_live():
    result = check(camera_jpeg(*NEAR, taken=now()))

    assert result.live
    assert result.source == "exif"


def test_old_photo_is_not_live():
    result = check(camera_jpeg(*SPOT, taken=now() - timedelta(hours=3)))

    assert not result.live
    assert "180 min old" in result.problems[0]


def test_gallery_photo_is_not_live():
    result = check(camera_jpeg(*SPOT, taken=now()), capture_source="gallery")

    assert any("gallery" in p for p in result.problems)


def test_exif_gps_must_match_reported_location():
    result = check(camera_jpeg(*FAR, taken=now()))

    assert any("from the reported location" in p for p in result.problems)


def test_app_location_needs_good_accuracy():
    image = camera_jpeg()  # camera wrote no GPS / time; the app reports them
    good = check(image, captured_at=now(), accuracy_m=12)
    vague = check(image, captured_at=now(), accuracy_m=400)
    missing_time = check(image, accuracy_m=12)

    assert good.live and good.source == "app"
    assert any("imprecise" in p for p in vague.problems)
    assert "Unknown when the photo was taken" in missing_time.problems


def test_proof_must_be_taken_at_the_complaint_location():
    at_spot = check(
        camera_jpeg(*NEAR, taken=now()),
        lat=NEAR[0],
        lng=NEAR[1],
        expected_lat=SPOT[0],
        expected_lng=SPOT[1],
    )
    elsewhere = check(
        camera_jpeg(*FAR, taken=now()),
        lat=FAR[0],
        lng=FAR[1],
        expected_lat=SPOT[0],
        expected_lng=SPOT[1],
    )

    assert at_spot.live and at_spot.distance_m < 50
    assert any("from the complaint location" in p for p in elsewhere.problems)


def test_strip_metadata_removes_gps():
    stripped = live_photo.strip_metadata(camera_jpeg(*SPOT, taken=now()), "jpg")

    assert live_photo.read_exif(stripped).lat is None


# --- enforced through the API (REQUIRE_LIVE_PHOTOS=true) ------------------------


def post_complaint(client, token, image, **data):
    return client.post(
        "/api/v1/citizen/complaints",
        data={"lat": str(SPOT[0]), "lng": str(SPOT[1]), "category": "pothole", **data},
        files={"photo": ("photo.jpg", image, "image/jpeg")},
        headers=auth_header(token),
    )


def test_strict_mode_rejects_gallery_photo(client, strict):
    response = post_complaint(
        client, citizen_token(client), camera_jpeg(), capture_source="gallery"
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "PHOTO_NOT_LIVE"
    assert response.json()["error"]["details"]


def test_strict_mode_accepts_live_photo_and_strips_exif(client, strict, tmp_path):
    response = post_complaint(
        client, citizen_token(client), camera_jpeg(*SPOT, taken=now()), capture_source="camera"
    )
    body = response.json()

    assert response.status_code == 201
    assert body["photo_check"]["live"] is True
    assert body["photo_check"]["source"] == "exif"
    stored = (tmp_path / body["photo_url"].removeprefix("/media/")).read_bytes()
    assert live_photo.read_exif(stored).lat is None


def test_development_mode_records_but_accepts(client):
    body = post_complaint(
        client, citizen_token(client), camera_jpeg(), capture_source="gallery"
    ).json()

    assert body["status"] == "new"
    assert body["photo_check"]["live"] is False


def test_strict_proof_must_be_taken_at_the_spot(client, strict, monkeypatch):
    complaint = post_complaint(
        client, citizen_token(client), camera_jpeg(*SPOT, taken=now(), seed=1)
    ).json()
    roads = staff_token(client, "officer.roads")
    url = f"/api/v1/staff/complaints/{complaint['id']}"
    client.patch(
        url, json={"assigned_to_id": staff_id(client, roads, "roads")}, headers=auth_header(roads)
    )
    client.patch(url, json={"status": "in_progress"}, headers=auth_header(roads))

    def proof(image, at):
        return client.post(
            f"{url}/proof",
            data={"lat": str(at[0]), "lng": str(at[1]), "capture_source": "camera"},
            files={"after_photo": ("after.jpg", image, "image/jpeg")},
            headers=auth_header(roads),
        )

    far = proof(camera_jpeg(*FAR, taken=now(), seed=2), FAR)
    assert far.status_code == 400
    assert "from the complaint location" in far.json()["error"]["details"][-1]["message"]

    at_spot = proof(camera_jpeg(*NEAR, taken=now(), seed=3), NEAR).json()
    assert at_spot["verification"]["photo_check"]["live"] is True
    assert at_spot["verification"]["photo_check"]["distance_m"] < 50
    assert at_spot["complaint"]["status"] == "resolved"


def test_geotag_at_spot_replaces_picture_comparison(monkeypatch):
    from app.agents.verification import verify_fix

    monkeypatch.setattr("app.agents.vision.supported_categories", lambda: {"pothole"})
    monkeypatch.setattr(
        "app.agents.vision.detect", lambda image: [pothole(0.9)] if image == b"before" else []
    )
    monkeypatch.setattr("app.agents.scene.same_place", lambda before, after: False)

    at_spot = verify_fix(
        "pothole", b"before", "image/jpeg", b"after", "image/jpeg", at_location=True
    )
    unknown = verify_fix(
        "pothole", b"before", "image/jpeg", b"after", "image/jpeg", at_location=False
    )

    assert at_spot.outcome == "verified"
    assert unknown.outcome == "not_checked"
