from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Ward(Base):
    __tablename__ = "wards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(120))
    # Approximate centre point. The prototype assigns a complaint to the nearest ward centre
    # (no real ward boundary polygons yet).
    center_lat: Mapped[float | None] = mapped_column(Float)
    center_lng: Mapped[float | None] = mapped_column(Float)
