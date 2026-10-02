from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import API_VERSION, get_settings
from app.core.errors import register_error_handlers
from app.routes import auth, health, wards

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

    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(wards.router, prefix=API_PREFIX)
    return app


app = create_app()
