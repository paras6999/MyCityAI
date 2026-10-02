from datetime import UTC, datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import AfterValidator, BaseModel

# Enum values from shared/constants.json / docs/API.md §2
Role = Literal["citizen", "officer", "ward_rep", "mayor", "admin"]
Department = Literal["water", "roads", "waste", "electricity", "drainage", "health", "other"]
Language = Literal["en", "mr", "hi"]


def _ensure_aware(value: datetime) -> datetime:
    # SQLite drops timezone info; treat stored values as UTC so the API always sends an offset.
    return value if value.tzinfo else value.replace(tzinfo=UTC)


AwareDatetime = Annotated[datetime, AfterValidator(_ensure_aware)]

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """Paginated list (API.md §1)."""

    items: list[T]
    page: int
    page_size: int
    total: int


class ItemList(BaseModel, Generic[T]):
    items: list[T]
