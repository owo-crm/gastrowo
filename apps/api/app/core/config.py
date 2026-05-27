from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "sqlite+pysqlite:///./dev_redesign.db"
    secret_key: str = "change-me-in-dev"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    cors_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"
    resend_api_key: str = ""
    resend_from_email: str = "noreply@info.owocrm.com"
    auth_session_cookie_name: str = "gastrowo_session"
    auth_session_ttl_days: int = 30
    auth_session_secure_cookie: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
