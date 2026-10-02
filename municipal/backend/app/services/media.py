from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings
from app.core.constants import limit
from app.core.errors import APIError

MEDIA_URL_PREFIX = "/media"
_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png"}


def media_root() -> Path:
    return Path(get_settings().media_dir).resolve()


def media_url(relative_path: str | None) -> str | None:
    return f"{MEDIA_URL_PREFIX}/{relative_path}" if relative_path else None


async def read_image(upload: UploadFile) -> tuple[bytes, str]:
    """Validate an uploaded photo and return (bytes, file extension)."""
    extension = _IMAGE_TYPES.get(upload.content_type or "")
    if extension is None:
        raise APIError(
            400, "VALIDATION_ERROR", "Photo must be a JPG or PNG image", [{"field": "photo"}]
        )
    max_bytes = limit("photo_max_mb") * 1024 * 1024
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise APIError(413, "FILE_TOO_LARGE", f"Photo must be at most {limit('photo_max_mb')} MB")
    if not data:
        raise APIError(400, "VALIDATION_ERROR", "Photo is empty", [{"field": "photo"}])
    return data, extension


def save_complaint_photo(complaint_id: int, name: str, data: bytes, extension: str) -> str:
    """Store a photo and return its path relative to MEDIA_DIR."""
    relative = Path("complaints") / str(complaint_id) / f"{name}.{extension}"
    target = media_root() / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return relative.as_posix()
