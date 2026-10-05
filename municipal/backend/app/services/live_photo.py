"""Was this photo taken on the spot, just now? (deployment rule: camera only, geotagged)

Evidence, best first:
- EXIF inside the photo: GPS position and the time the camera took it
- what the app reports at capture time: GPS (+ accuracy), capture time, camera vs gallery

A photo is "live" when it was taken recently, has a trustworthy position, and that position
matches the reported location (and, for repair proof, the complaint's location).
With REQUIRE_LIVE_PHOTOS=false (development) problems are recorded but not enforced.

Limits: a modified app can fake what it reports. Making that tamper-proof needs device
attestation (e.g. Google Play Integrity), which is outside this prototype.
"""

import io
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Literal

from PIL import ExifTags, Image, ImageOps

from app.agents.duplicates import distance_m
from app.core.config import get_settings

CLOCK_SKEW = timedelta(minutes=2)  # phone clocks drift a little


@dataclass(frozen=True)
class ExifInfo:
    lat: float | None
    lng: float | None
    taken_at: datetime | None


@dataclass
class LivePhotoCheck:
    source: Literal["exif", "app", "none"]
    lat: float | None
    lng: float | None
    captured_at: datetime | None
    accuracy_m: float | None
    distance_m: float | None  # from the expected place (repair proof) or the reported location
    problems: list[str] = field(default_factory=list)

    @property
    def live(self) -> bool:
        return not self.problems

    def to_json(self) -> dict[str, Any]:
        return {
            "live": self.live,
            "source": self.source,
            "captured_at": self.captured_at.isoformat() if self.captured_at else None,
            "accuracy_m": self.accuracy_m,
            "distance_m": round(self.distance_m, 1) if self.distance_m is not None else None,
            "problems": self.problems,
        }


def _to_degrees(value, ref) -> float | None:
    try:
        degrees = float(value[0]) + float(value[1]) / 60 + float(value[2]) / 3600
    except (TypeError, ValueError, IndexError, ZeroDivisionError):
        return None
    return -degrees if ref in ("S", "W") else degrees


def _parse_exif_time(text: str | None, offset: str | None) -> datetime | None:
    if not text:
        return None
    try:
        naive = datetime.strptime(text.strip(), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None
    if offset:  # e.g. "+05:30"
        try:
            sign = -1 if offset.startswith("-") else 1
            hours, minutes = offset.lstrip("+-").split(":")
            tz = timezone(sign * timedelta(hours=int(hours), minutes=int(minutes)))
            return naive.replace(tzinfo=tz)
        except ValueError:
            pass
    # Cameras store local time; without an offset assume the city's time zone.
    return naive.replace(
        tzinfo=timezone(timedelta(minutes=get_settings().photo_utc_offset_minutes))
    )


def read_exif(image: bytes) -> ExifInfo:
    try:
        exif = Image.open(io.BytesIO(image)).getexif()
    except Exception:
        return ExifInfo(None, None, None)
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    details = exif.get_ifd(ExifTags.IFD.Exif)
    lat = _to_degrees(gps.get(ExifTags.GPS.GPSLatitude), gps.get(ExifTags.GPS.GPSLatitudeRef))
    lng = _to_degrees(gps.get(ExifTags.GPS.GPSLongitude), gps.get(ExifTags.GPS.GPSLongitudeRef))
    taken = _parse_exif_time(
        details.get(ExifTags.Base.DateTimeOriginal) or exif.get(ExifTags.Base.DateTime),
        details.get(ExifTags.Base.OffsetTimeOriginal),
    )
    return ExifInfo(lat if lng is not None else None, lng if lat is not None else None, taken)


def check_live_photo(
    image: bytes,
    *,
    lat: float | None,
    lng: float | None,
    captured_at: datetime | None,
    accuracy_m: float | None,
    capture_source: str | None,
    expected_lat: float | None = None,
    expected_lng: float | None = None,
    now: datetime | None = None,
) -> LivePhotoCheck:
    """Check the photo against the deployment rules; never raises."""
    settings = get_settings()
    now = now or datetime.now(UTC)
    exif = read_exif(image)
    problems: list[str] = []

    if capture_source == "gallery":
        problems.append("Photo was picked from the gallery; take it with the camera on the spot")

    taken = exif.taken_at or captured_at
    if taken is None:
        problems.append("Unknown when the photo was taken")
    else:
        taken = taken if taken.tzinfo else taken.replace(tzinfo=UTC)
        age = now - taken
        if age > timedelta(minutes=settings.max_photo_age_minutes):
            problems.append(
                f"Photo is {int(age.total_seconds() // 60)} min old; "
                f"it must be taken within {settings.max_photo_age_minutes} min"
            )
        elif age < -CLOCK_SKEW:
            problems.append("Photo time is in the future; check the phone's clock")

    if exif.lat is not None:
        source, point_lat, point_lng = "exif", exif.lat, exif.lng
        if lat is not None and lng is not None:
            gap = distance_m(exif.lat, exif.lng, lat, lng)
            if gap > settings.max_photo_distance_m:
                problems.append(f"Photo GPS is {gap:.0f} m from the reported location")
    elif lat is not None and lng is not None:
        source, point_lat, point_lng = "app", lat, lng
        if accuracy_m is None:
            problems.append("GPS accuracy missing")
        elif accuracy_m > settings.max_gps_accuracy_m:
            problems.append(
                f"GPS too imprecise ({accuracy_m:.0f} m); wait for a better fix "
                f"(≤ {settings.max_gps_accuracy_m} m)"
            )
    else:
        source, point_lat, point_lng = "none", None, None
        problems.append("Photo has no location")

    distance = None
    if point_lat is not None and expected_lat is not None and expected_lng is not None:
        distance = distance_m(point_lat, point_lng, expected_lat, expected_lng)
        if distance > settings.max_photo_distance_m:
            problems.append(
                f"Photo taken {distance:.0f} m from the complaint location "
                f"(must be within {settings.max_photo_distance_m} m)"
            )

    return LivePhotoCheck(
        source=source,
        lat=point_lat,
        lng=point_lng,
        captured_at=taken,
        accuracy_m=accuracy_m if source == "app" else None,
        distance_m=distance,
        problems=problems,
    )


def strip_metadata(image: bytes, extension: str) -> bytes:
    """Re-save without EXIF (GPS, phone model, …) before the photo is stored and served.

    The orientation is applied first so the picture still shows the right way up.
    """
    try:
        picture = ImageOps.exif_transpose(Image.open(io.BytesIO(image)))
        out = io.BytesIO()
        if extension == "png":
            picture.save(out, format="PNG")
        else:
            picture.convert("RGB").save(out, format="JPEG", quality=90)
        return out.getvalue()
    except Exception:
        return image  # undecodable (e.g. test bytes): keep as uploaded


def enforce(check: LivePhotoCheck) -> None:
    """Reject a non-live photo when the deployment rule is on."""
    if get_settings().require_live_photos and not check.live:
        from app.core.errors import APIError

        raise APIError(
            400,
            "PHOTO_NOT_LIVE",
            "Take the photo with the camera at the location (geotagged, just now)",
            [{"field": "photo", "message": problem} for problem in check.problems],
        )
