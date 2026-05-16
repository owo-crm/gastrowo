from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def ok(data: Any = None, meta: Mapping[str, Any] | None = None) -> dict[str, Any]:
    return {"data": data, "meta": dict(meta or {}), "error": None}


def error_payload(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {
        "data": None,
        "meta": {},
        "error": {
            "code": code,
            "message": message,
            "details": details,
        },
    }