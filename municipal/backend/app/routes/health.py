from fastapi import APIRouter

from app.core.config import API_VERSION
from app.core.db import database_is_up

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": API_VERSION,
        "database": "ok" if database_is_up() else "unavailable",
    }
