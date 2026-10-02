from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 3},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_is_up() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
