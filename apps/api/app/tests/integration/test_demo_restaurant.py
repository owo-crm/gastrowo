from __future__ import annotations

from app.tests.integration.test_api_flow import auth_header, signup_ADMIN

SECRET = "d" * 32


def test_demo_restaurant_is_only_for_the_test_account(client, monkeypatch):
    from app.core.config import settings

    admin, _ = signup_ADMIN(client, organization_name="Plain Diner", email="owner@plain-diner.com")
    monkeypatch.setattr(settings, "dev_login_secret", "")
    monkeypatch.setattr(settings, "dev_login_enabled", False)
    assert client.get("/auth/me", headers=auth_header(admin)).json()["data"]["is_demo_account"] is False
    assert client.post("/organizations/current/demo-restaurant", headers=auth_header(admin)).status_code == 403


def test_test_account_gets_pro_and_a_running_restaurant(client, monkeypatch):
    from app.core.config import settings

    signup_ADMIN(client, organization_name="Demo Diner", email="owner@demo-diner.com")
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "dev_login_secret", SECRET)
    monkeypatch.setattr(settings, "dev_login_email", "owner@demo-diner.com")

    # No workers yet: the worker login explains what to do instead of signing in as someone random.
    assert client.post("/auth/dev-login", json={"secret": SECRET, "as_role": "staff"}).status_code == 404

    login = client.post("/auth/dev-login", json={"secret": SECRET})
    assert login.status_code == 200, login.text
    token = login.json()["data"]["access_token"]
    me = client.get("/auth/me", headers=auth_header(token)).json()["data"]
    assert me["is_demo_account"] is True
    assert me["subscription"]["plan"] == "pro"
    assert me["subscription"]["status"] == "active"
    assert me["subscription"]["trial_ends_at"] is None

    first = client.post("/organizations/current/demo-restaurant", headers=auth_header(token))
    assert first.status_code == 200, first.text
    counts = first.json()["data"]
    assert counts["people"] == 12
    assert counts["shifts"] > 50
    assert counts["timesheets"] > 20
    assert counts["revenue_days"] >= 7

    # Running it again starts over instead of piling up.
    second = client.post("/organizations/current/demo-restaurant", headers=auth_header(token)).json()["data"]
    assert second["people"] == counts["people"]
    users = client.get("/users", headers=auth_header(token)).json()["data"]
    assert len(users) == counts["people"] + 1
    assert client.get("/locations", headers=auth_header(token)).json()["data"].__len__() == 2

    payroll = client.get("/payroll/summary", headers=auth_header(token)).json()
    assert payroll.get("data") is not None
    tasks = client.get("/tasks", headers=auth_header(token)).json()["data"]
    assert len(tasks) == 6

    staff_login = client.post("/auth/dev-login", json={"secret": SECRET, "as_role": "staff"})
    assert staff_login.status_code == 200, staff_login.text
    assert staff_login.json()["data"]["role"] == "STAFF"
    staff_me = client.get("/auth/me", headers=auth_header(staff_login.json()["data"]["access_token"])).json()["data"]
    assert staff_me["email"].endswith("@demo.gastrostuff.app")
    assert staff_me["is_demo_account"] is False
    assert staff_me["active_organization_id"] == me["active_organization_id"]
