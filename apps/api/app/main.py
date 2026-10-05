from __future__ import annotations

import logging
import time as time_module
from uuid import UUID

from starlette.concurrency import run_in_threadpool

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.envelope import error_payload, ok
from contextlib import contextmanager

from app.db import SessionLocal, get_db, init_db
from app.routers import (
    auth,
    availability,
    billing,
    calendar,
    clock,
    dashboard,
    locations,
    marketing,
    notifications,
    organizations,
    payroll,
    platform,
    platform_auth,
    push,
    positions,
    reports,
    schedule,
    shifts,
    support,
    tasks,
    timesheets,
    users,
    workers,
)

from app.core.security import decode_token
from app.models import Organization
from app.services import sandbox as sandbox_service
from app.services.push import install_push_hooks
from app.services.timeclock import backfill_pins, install_pin_hooks

logging.basicConfig(level=logging.INFO)
install_push_hooks()
install_pin_hooks()

if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.app_env, traces_sample_rate=0.0, send_default_pii=False)
logger = logging.getLogger("workdish.api")

# The full internal schema is not published in production; the public part is described at
# https://platofy.app/openapi.json (linked from /.well-known/api-catalog).
_public_docs = settings.app_env != "production"
app = FastAPI(
    title="Platofy API",
    version="0.1.0",
    docs_url="/docs" if _public_docs else None,
    redoc_url="/redoc" if _public_docs else None,
    openapi_url="/openapi.json" if _public_docs else None,
)



@contextmanager
def _request_db():
    """The same session the routes get, so test overrides of get_db apply here too."""
    generator = app.dependency_overrides.get(get_db, get_db)()
    try:
        yield next(generator)
    finally:
        generator.close()


def _sandbox_organization_blocked(authorization: str) -> bool:
    """True when the caller's business is a public demo."""
    if not authorization.lower().startswith("bearer "):
        return False
    try:
        org_id = UUID(str(decode_token(authorization[7:]).get("org_id")))
    except Exception:  # noqa: BLE001 - a bad token is the route's own 401 to give
        return False
    with _request_db() as db:
        organization = db.get(Organization, org_id)
        return bool(organization and organization.is_sandbox)


_last_sandbox_cleanup = 0.0


def _cleanup_sandboxes() -> None:
    with _request_db() as db:
        sandbox_service.cleanup_expired(db)


@app.middleware("http")
async def sandbox_guard(request: Request, call_next):
    """Demo businesses can't open a kiosk, pay, invite real people or subscribe to push."""
    global _last_sandbox_cleanup
    if sandbox_service.is_blocked(request.method, request.url.path):
        if await run_in_threadpool(_sandbox_organization_blocked, request.headers.get("authorization", "")):
            return JSONResponse(
                status_code=403,
                content=error_payload(code="DEMO_FEATURE_OFF", message="Not available in the demo", details=None),
            )
    if time_module.monotonic() - _last_sandbox_cleanup > 600:
        _last_sandbox_cleanup = time_module.monotonic()
        try:
            await run_in_threadpool(_cleanup_sandboxes)
        except Exception:  # noqa: BLE001 - cleanup must never break a request
            logger.exception("Demo cleanup failed")
    return await call_next(request)


# Added last so it wraps everything above, including the demo guard's 403.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    # Members from before PINs were stored readably get a fresh one, so every card can show it.
    with SessionLocal() as db:
        backfill_pins(db)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(code=f"HTTP_{exc.status_code}", message=str(exc.detail), details=None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=error_payload(code="VALIDATION_ERROR", message="Validation failed", details=jsonable_encoder(exc.errors())),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled application error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=error_payload(code="INTERNAL_ERROR", message="Unexpected server error", details=None),
    )


@app.get("/health")
def healthcheck():
    """For uptime monitors: 200 only when the database answers too."""
    from sqlalchemy import text

    from app.db import engine

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check: database unreachable")
        return JSONResponse(status_code=503, content=error_payload(code="DB_DOWN", message="Database unreachable", details=None))
    return ok({"status": "ok", "env": settings.app_env})


class ClientError(BaseModel):
    message: str = Field(max_length=2000)
    stack: str | None = Field(default=None, max_length=8000)
    url: str | None = Field(default=None, max_length=1000)


@app.post("/client-errors")
def report_client_error(payload: ClientError, request: Request):
    """Crashes in the browser app land in the server log (and Sentry when configured)."""
    logger.error("Client error at %s: %s\n%s", payload.url, payload.message, payload.stack or "")
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.capture_message(f"Client error: {payload.message}", level="error")
    return ok({"received": True})


app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(billing.router)
app.include_router(locations.router)
app.include_router(users.router)
app.include_router(workers.router)
app.include_router(positions.router)
app.include_router(availability.router)
app.include_router(schedule.router)
app.include_router(shifts.router)
app.include_router(support.router)
app.include_router(marketing.router)
app.include_router(calendar.router)
app.include_router(timesheets.router)
app.include_router(tasks.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)
app.include_router(payroll.router)
app.include_router(clock.router)
app.include_router(platform.router)
app.include_router(platform_auth.router)
app.include_router(push.router)
