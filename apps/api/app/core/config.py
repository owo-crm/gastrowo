from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "sqlite+pysqlite:///./dev_redesign.db"
    secret_key: str = "change-me-in-dev"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    frontend_url: str = "http://localhost:5173"
    resend_api_key: str = ""
    resend_from_email: str = "noreply@info.owocrm.com"
    auth_session_cookie_name: str = "gastrowo_session"
    auth_session_ttl_days: int = 30
    auth_session_secure_cookie: bool = False
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_pro_monthly: str = ""
    stripe_price_pro_annual: str = ""
    stripe_price_business_monthly: str = ""
    stripe_price_business_annual: str = ""
    stripe_checkout_success_url: str | None = None
    stripe_checkout_cancel_url: str | None = None
    stripe_portal_return_url: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def billing_success_url(self) -> str:
        return self.stripe_checkout_success_url or f"{self.frontend_url.rstrip('/')}/billing?checkout=success"

    @property
    def billing_cancel_url(self) -> str:
        return self.stripe_checkout_cancel_url or f"{self.frontend_url.rstrip('/')}/billing?checkout=canceled"

    @property
    def billing_portal_return_url(self) -> str:
        return self.stripe_portal_return_url or f"{self.frontend_url.rstrip('/')}/billing"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
