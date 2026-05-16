from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import OtpSendRequest


def test_otp_send_requires_email():
    with pytest.raises(ValidationError):
        OtpSendRequest(purpose="login")
