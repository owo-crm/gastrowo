from __future__ import annotations

import pytest

from app.core.config import Settings
from app.tests.otp_outbox import sent_code


def _start_owner_signup(client, email: str) -> str:
    response = client.post("/auth/otp/send", json={"email": email, "purpose": "owner_signup"})
    assert response.status_code == 200
    return sent_code(email)


def test_otp_locks_after_too_many_wrong_codes(client):
    email = "owner@bruteforce.com"
    code = _start_owner_signup(client, email)
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(5):
        attempt = client.post("/auth/otp/verify", json={"email": email, "code": wrong, "purpose": "owner_signup"})
        assert attempt.status_code == 401

    # Even the correct code is refused once the challenge is locked.
    locked = client.post("/auth/otp/verify", json={"email": email, "code": code, "purpose": "owner_signup"})
    assert locked.status_code == 429


def test_otp_resend_has_cooldown(client):
    email = "owner@cooldown.com"
    _start_owner_signup(client, email)
    again = client.post("/auth/otp/send", json={"email": email, "purpose": "owner_signup"})
    assert again.status_code == 429


def test_otp_codes_are_random(client):
    codes = {_start_owner_signup(client, f"owner{index}@random.com") for index in range(5)}
    assert all(len(code) == 6 and code.isdigit() for code in codes)
    # Time-derived codes issued back to back were nearly identical; random ones are not.
    assert len(codes) > 1


def test_user_cannot_create_second_business(client):
    email = "owner@single.com"
    code = _start_owner_signup(client, email)
    verify = client.post("/auth/otp/verify", json={"email": email, "code": code, "purpose": "owner_signup"})
    complete = client.post(
        "/auth/onboarding/owner/complete",
        json={
            "verification_token": verify.json()["data"]["verification_token"],
            "organization_name": "Single Org",
            "full_name": "Owner",
            "email": email,
            "password": "Owner123!",
            "source": "Google",
        },
    )
    token = complete.json()["data"]["access_token"]

    second = client.post("/organizations", headers={"Authorization": f"Bearer {token}"}, json={"name": "Second Org"})
    assert second.status_code == 409


def test_production_rejects_default_secret_key():
    with pytest.raises(ValueError):
        Settings(app_env="production", secret_key="change-me-in-dev")


def test_database_url_is_normalized_for_psycopg2():
    settings = Settings(database_url="postgres://user:pass@db:5432/app")
    assert settings.database_url == "postgresql+psycopg2://user:pass@db:5432/app"
    settings = Settings(database_url="postgresql+psycopg://user:pass@db:5432/app")
    assert settings.database_url == "postgresql+psycopg2://user:pass@db:5432/app"


def test_dev_login_is_hidden_unless_enabled(client):
    assert client.post("/auth/dev-login").status_code == 404


def test_dev_login_signs_in_as_admin(client, monkeypatch):
    from app.core.config import settings

    email = "owner@devlogin.com"
    code = _start_owner_signup(client, email)
    verify = client.post("/auth/otp/verify", json={"email": email, "code": code, "purpose": "owner_signup"})
    client.post(
        "/auth/onboarding/owner/complete",
        json={
            "verification_token": verify.json()["data"]["verification_token"],
            "organization_name": "Dev Login Org",
            "full_name": "Owner",
            "email": email,
            "password": "Owner123!",
            "source": "Google",
        },
    )

    monkeypatch.setattr(settings, "dev_login_enabled", True)
    login = client.post("/auth/dev-login")
    assert login.status_code == 200
    assert login.json()["data"]["role"] == "ADMIN"
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {login.json()['data']['access_token']}"})
    assert me.json()["data"]["email"] == email


def test_production_rejects_dev_login():
    with pytest.raises(ValueError):
        Settings(app_env="production", secret_key="x" * 40, dev_login_enabled=True)


def test_dev_login_with_secret_works_in_production(client, monkeypatch):
    from app.core.config import settings

    email = "owner@secretlogin.com"
    code = _start_owner_signup(client, email)
    verify = client.post("/auth/otp/verify", json={"email": email, "code": code, "purpose": "owner_signup"})
    client.post(
        "/auth/onboarding/owner/complete",
        json={
            "verification_token": verify.json()["data"]["verification_token"],
            "organization_name": "Secret Login Org",
            "full_name": "Owner",
            "email": email,
            "password": "Owner123!",
            "source": "Google",
        },
    )
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "dev_login_secret", "s" * 32)

    assert client.post("/auth/dev-login").status_code == 404
    assert client.post("/auth/dev-login", json={"secret": "wrong" * 8}).status_code == 404
    login = client.post("/auth/dev-login", json={"secret": "s" * 32})
    assert login.status_code == 200
    assert login.json()["data"]["role"] == "ADMIN"


def test_short_dev_login_secret_is_rejected():
    with pytest.raises(ValueError):
        Settings(dev_login_secret="short")


def test_invite_link_joins_without_a_code_but_never_takes_over_an_account(client):
    from app.tests.integration.test_api_flow import auth_header, signup_ADMIN

    admin, _ = signup_ADMIN(client, organization_name="Invite Diner", email="owner@invite-diner.com")
    link = client.post("/organizations/members/link-by-email", headers=auth_header(admin), json={"email": "new@invite-diner.com"}).json()["data"]["debug_join_link"]
    token = link.split("token=")[1]

    assert client.post("/auth/invites/join/accept", json={"email": "other@invite-diner.com", "invite_token": token, "full_name": "Nope", "password": "Passw0rd!"}).status_code == 404
    joined = client.post("/auth/invites/join/accept", json={"email": "new@invite-diner.com", "invite_token": token, "full_name": "New Cook", "password": "Passw0rd!"})
    assert joined.status_code == 200, joined.text
    assert joined.json()["data"]["role"] == "STAFF"
    # One use only, and the password works for the next sign-in.
    assert client.post("/auth/invites/join/accept", json={"email": "new@invite-diner.com", "invite_token": token, "full_name": "New Cook", "password": "Passw0rd!"}).status_code == 404
    assert client.post("/auth/login", json={"email": "new@invite-diner.com", "password": "Passw0rd!"}).status_code == 200


def test_password_guessing_is_locked_out(client):
    from app.tests.integration.test_api_flow import signup_ADMIN

    signup_ADMIN(client, organization_name="Lockout Diner", email="owner@lockout-diner.com")
    codes = [client.post("/auth/login", json={"email": "owner@lockout-diner.com", "password": f"wrong-{index}"}).status_code for index in range(9)]
    assert codes[:8] == [401] * 8 and codes[8] == 429
    # Even the right password waits out the lock.
    assert client.post("/auth/login", json={"email": "owner@lockout-diner.com", "password": "ADMIN123!"}).status_code == 429
