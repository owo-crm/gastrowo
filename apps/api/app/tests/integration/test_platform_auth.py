from __future__ import annotations

from app.services import totp
from app.tests.integration.test_api_flow import auth_header, signup_ADMIN
from app.tests.otp_outbox import SENT_CODES


def _email_step(client, email):
    assert client.post("/platform/auth/start", json={"email": email}).status_code == 200
    return client.post("/platform/auth/verify-email", json={"email": email, "code": SENT_CODES[email]}).json()["data"]


def test_admin_panel_needs_its_own_sign_in_with_an_authenticator(client, monkeypatch):
    from app.core.config import settings

    owner, _ = signup_ADMIN(client, organization_name="Platofy HQ", email="me@plato-hq.com")
    monkeypatch.setattr(settings, "platform_admin_emails", "me@plato-hq.com")

    # The admin's own business sign-in no longer opens the panel.
    assert client.get("/platform/stats", headers=auth_header(owner)).status_code == 401

    # Other addresses get the same answer but no code.
    assert client.post("/platform/auth/start", json={"email": "stranger@x.com"}).json()["data"] == {"sent": True}
    assert "stranger@x.com" not in SENT_CODES

    # First sign-in: email code, then set up the app with the shown secret.
    setup = _email_step(client, "me@plato-hq.com")
    assert setup["next"] == "setup" and setup["otpauth_uri"].startswith("otpauth://totp/")
    assert client.post("/platform/auth/verify-totp", json={"ticket": setup["ticket"], "code": "000000"}).status_code == 401
    code = totp.code_at(setup["secret"], totp.current_step())
    session = client.post("/platform/auth/verify-totp", json={"ticket": setup["ticket"], "code": code}).json()["data"]["token"]
    assert client.get("/platform/stats", headers=auth_header(session)).status_code == 200
    # An admin session is not a business sign-in.
    assert client.get("/auth/me", headers=auth_header(session)).status_code == 401

    # Next time the app's code is required, and the same code can't be used twice.
    again = _email_step(client, "me@plato-hq.com")
    assert again["next"] == "totp" and "secret" not in again
    assert client.post("/platform/auth/verify-totp", json={"ticket": again["ticket"], "code": code}).status_code == 401

    # Signing out ends every admin session.
    assert client.post("/platform/auth/logout", headers=auth_header(session)).status_code == 200
    assert client.get("/platform/stats", headers=auth_header(session)).status_code == 401


def test_wrong_codes_lock_the_admin_sign_in(client, monkeypatch):
    from app.core.config import settings

    signup_ADMIN(client, organization_name="Platofy HQ", email="me@plato-hq.com")
    monkeypatch.setattr(settings, "platform_admin_emails", "me@plato-hq.com")
    assert client.post("/platform/auth/start", json={"email": "me@plato-hq.com"}).status_code == 200
    for _ in range(5):
        assert client.post("/platform/auth/verify-email", json={"email": "me@plato-hq.com", "code": "999999"}).status_code in (401, 429)
    right = SENT_CODES["me@plato-hq.com"]
    assert client.post("/platform/auth/verify-email", json={"email": "me@plato-hq.com", "code": right}).status_code == 429
