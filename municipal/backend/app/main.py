import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import API_VERSION, get_settings
from app.core.errors import register_error_handlers
from app.routes import auth, citizen, complaints_staff, health, wards, ws
from app.services.media import MEDIA_URL_PREFIX, media_root
from app.services.realtime import hub

API_PREFIX = "/api/v1"

# Show the app's own log lines (dev OTP, push results, errors) next to uvicorn's.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    hub.bind_loop(asyncio.get_running_loop())
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="MyCityAI Municipal API", version=API_VERSION, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    for module in (health, auth, wards, citizen, complaints_staff):
        app.include_router(module.router, prefix=API_PREFIX)
    app.include_router(ws.router)  # WS /ws/dashboard (no /api/v1 prefix, see API.md §10.1)

    media_root().mkdir(parents=True, exist_ok=True)
    app.mount(MEDIA_URL_PREFIX, StaticFiles(directory=media_root()), name="media")
    return app


app = create_app()
