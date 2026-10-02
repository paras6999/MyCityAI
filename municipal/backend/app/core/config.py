from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

API_VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://mycity:mycity@localhost:5433/mycity_municipal"
    # Comma-separated list, e.g. "http://localhost:5173,http://192.168.1.5:5173"
    cors_origins: str = "http://localhost:5173"

    jwt_secret: str = "dev-only-secret-change-me-in-production-please"
    access_token_minutes: int = 60
    refresh_token_days: int = 30

    otp_ttl_seconds: int = 300
    otp_resend_seconds: int = 30
    otp_max_attempts: int = 5
    dev_otp: str = "123456"

    seed_staff_password: str = "mycity-dev"

    # Uploaded photos are stored here and served at /media
    media_dir: str = "media"
    # Optional override; defaults to <repo>/shared/constants.json
    constants_path: str | None = None

    # Push notifications via the Expo push service (works with Expo Go, no Firebase setup)
    push_enabled: bool = True
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"

    # AI (Google Gemini). Without a key the keyword fallback classifier is used.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    ai_timeout_seconds: int = 20

    # Local YOLO photo detection (needs requirements-ml.txt). Models: ml/vision/models.json
    vision_enabled: bool = True
    vision_models_file: str | None = None
    models_dir: str = "models"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
