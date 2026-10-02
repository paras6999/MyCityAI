from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

API_VERSION = "0.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://mycity:mycity@localhost:5432/mycity_municipal"
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

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
