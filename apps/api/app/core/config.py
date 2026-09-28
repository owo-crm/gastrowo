from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "sqlite+pysqlite:///./dev_redesign.db"
    secret_key: str = "change-me-in-dev"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    frontend_url: str = "http://localhost:5173"
    # Contact the push services see in our VAPID claims; they use it if our pushes misbehave.
    push_contact_email: str = "support@gastrostuff.pl"
    resend_api_key: str = ""
    resend_from_email: str = "noreply@info.owocrm.com"
    auth_session_cookie_name: str = "gastrowo_session"
    auth_session_ttl_days: int = 30
    auth_session_secure_cookie: bool = False
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_standard_monthly: str = ""
    stripe_price_standard_annual: str = ""
    stripe_price_pro_monthly: str = ""
    stripe_price_pro_annual: str = ""
    stripe_price_business_monthly: str = ""
    stripe_price_business_annual: str = ""
    # Per-location prices (Stripe quantity = number of locations), one set per currency.
    stripe_price_starter_usd_monthly: str = ""
    stripe_price_starter_usd_annual: str = ""
    stripe_price_pro_usd_monthly: str = ""
    stripe_price_pro_usd_annual: str = ""
    stripe_price_starter_pln_monthly: str = ""
    stripe_price_starter_pln_annual: str = ""
    stripe_price_pro_pln_monthly: str = ""
    stripe_price_pro_pln_annual: str = ""
    stripe_checkout_success_url: str | None = None
    stripe_checkout_cancel_url: str | None = None
    stripe_portal_return_url: str | None = None
    # Comma-separated emails of Plato staff allowed to read platform-wide data (e.g. waitlist leads).
    platform_admin_emails: str = ""
    # Test-only one-click login (POST /auth/dev-login). Refused in production.
    dev_login_enabled: bool = False
    dev_login_email: str = ""
    # Secret test login that also works in production: open /?test=<secret> once in the browser.
    dev_login_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @model_validator(mode="after")
    def _normalize_and_check(self) -> "Settings":
        # Hosting providers hand out postgres:// or postgresql+psycopg:// URLs; only psycopg2 is installed.
        for prefix in ("postgres://", "postgresql://", "postgresql+psycopg://"):
            if self.database_url.startswith(prefix):
                self.database_url = "postgresql+psycopg2://" + self.database_url[len(prefix) :]
                break
        if self.dev_login_secret and len(self.dev_login_secret) < 24:
            raise ValueError("DEV_LOGIN_SECRET must be at least 24 characters")
        if self.app_env == "production":
            if self.secret_key in {"change-me-in-dev", "replace-with-a-long-random-secret"} or len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY must be set to a random value of at least 32 characters in production")
            self.auth_session_secure_cookie = True
            if self.dev_login_enabled:
                raise ValueError("DEV_LOGIN_ENABLED must not be set in production")
        return self

    @property
    def parsed_platform_admin_emails(self) -> set[str]:
        return {item.strip().lower() for item in self.platform_admin_emails.split(",") if item.strip()}

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
