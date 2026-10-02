from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import API_VERSION, get_settings
from app.core.errors import register_error_handlers
from app.routes import auth, citizen, complaints_staff, health, wards
from app.services.media import MEDIA_URL_PREFIX, media_root

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="MyCityAI Municipal API", version=API_VERSION)

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

    media_root().mkdir(parents=True, exist_ok=True)
    app.mount(MEDIA_URL_PREFIX, StaticFiles(directory=media_root()), name="media")
    return app


app = create_app()
