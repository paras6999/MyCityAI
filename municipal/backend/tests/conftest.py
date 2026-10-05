from collections.abc import Iterator

import bcrypt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.db import get_db
from app.main import app
from app.models import Base
from app.seed import seed

SEED_PASSWORD = get_settings().seed_staff_password
DEV_OTP = get_settings().dev_otp


_real_gensalt = bcrypt.gensalt


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch):
    """bcrypt's production cost (12 rounds) makes every login slow; tests use the minimum."""
    monkeypatch.setattr("app.core.security.bcrypt.gensalt", lambda: _real_gensalt(4))


@pytest.fixture(autouse=True)
def no_real_gemini(monkeypatch):
    """Tests never call the real Gemini API, even if GEMINI_API_KEY is set in .env."""
    monkeypatch.setattr("app.agents.gemini._client", lambda: None)
    # ...and never load YOLO models (slow); tests that need detections fake vision.detect.
    monkeypatch.setattr("app.agents.vision._load_models", lambda: [])
    # ...and use the seasonal forecast (no PyTorch LSTM) so results do not depend on a model.
    monkeypatch.setattr("app.agents.forecast._load_lstm", lambda: None)
    # ...and never start the background scheduler (it uses the real database).
    monkeypatch.setattr("app.services.scheduler.start", lambda: None)


@pytest.fixture
def db() -> Iterator[Session]:
    """Fresh in-memory SQLite database per test, with seed data loaded."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with TestingSession() as session:
        seed(session)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
