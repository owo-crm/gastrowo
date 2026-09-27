"""In-memory outbox for OTP codes, filled by the conftest patch instead of sending emails."""

from __future__ import annotations

SENT_CODES: dict[str, str] = {}


def sent_code(email: str) -> str:
    return SENT_CODES[email.lower()]
