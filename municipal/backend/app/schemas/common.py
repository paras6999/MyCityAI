from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator

# Enum values from shared/constants.json / docs/API.md §2
Role = Literal["citizen", "officer", "ward_rep", "mayor", "admin"]
Department = Literal["water", "roads", "waste", "electricity", "drainage", "health", "other"]
Language = Literal["en", "mr", "hi"]


def _ensure_aware(value: datetime) -> datetime:
    # SQLite drops timezone info; treat stored values as UTC so the API always sends an offset.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


AwareDatetime = Annotated[datetime, AfterValidator(_ensure_aware)]
