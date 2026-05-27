from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.envelope import error_payload, ok
from app.db import init_db
from app.routers import (
    auth,
    availability,
    dashboard,
    locations,
    notifications,
    organizations,
    payroll,
    positions,
    reports,
    schedule,
    shifts,
    tasks,
    timesheets,
    users,
    workers,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workdish.api")

app = FastAPI(title="Workdish API", version="0.1.0")

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
    return ok({"status": "ok", "env": settings.app_env})


app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(locations.router)
app.include_router(users.router)
app.include_router(workers.router)
app.include_router(positions.router)
app.include_router(availability.router)
app.include_router(schedule.router)
app.include_router(shifts.router)
app.include_router(timesheets.router)
app.include_router(tasks.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)
app.include_router(payroll.router)
