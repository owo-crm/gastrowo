from __future__ import annotations

from app.tests.integration.test_api_flow import auth_header, signup_ADMIN


def _setup(client, monkeypatch):
    from app.core.config import settings

    boss, _ = signup_ADMIN(client, organization_name="Platofy HQ", email="me@plato-hq.com")
    monkeypatch.setattr(settings, "platform_admin_emails", "me@plato-hq.com")
    customer, _ = signup_ADMIN(client, organization_name="Taco Stand", email="owner@taco-stand.com")
    orgs = client.get("/platform/organizations", headers=auth_header(boss)).json()["data"]
    taco = next(item for item in orgs if item["name"] == "Taco Stand")
    return boss, customer, taco["id"]


def _plan(client, token):
    return client.get("/auth/me", headers=auth_header(token)).json()["data"]["subscription"]


def test_only_platform_admins_get_in(client, monkeypatch):
    boss, customer, taco = _setup(client, monkeypatch)
    assert client.get("/platform/organizations", headers=auth_header(customer)).status_code == 403
    assert client.post(f"/platform/organizations/{taco}/subscription", headers=auth_header(customer), json={"action": "set_plan", "plan": "pro"}).status_code == 403
    assert client.get("/platform/stats", headers=auth_header(boss)).json()["data"]["businesses"] == 2
    # Search by owner email.
    found = client.get("/platform/organizations?q=taco-stand.com", headers=auth_header(boss)).json()["data"]
    assert [item["name"] for item in found] == ["Taco Stand"]


def test_extend_comp_discount_cancel_and_log(client, monkeypatch):
    boss, customer, taco = _setup(client, monkeypatch)
    url = f"/platform/organizations/{taco}/subscription"

    assert client.post(url, headers=auth_header(boss), json={"action": "set_plan", "plan": "pro"}).status_code == 200
    summary = _plan(client, customer)
    assert summary["plan"] == "pro" and summary["status"] == "active" and summary["trial_ends_at"] is None

    assert client.post(url, headers=auth_header(boss), json={"action": "cancel"}).status_code == 200
    assert _plan(client, customer)["plan"] == "free"

    extended = client.post(url, headers=auth_header(boss), json={"action": "extend", "days": 30}).json()["data"]
    assert extended["plan"] == "pro" and extended["status"] == "trialing"
    summary = _plan(client, customer)
    assert summary["plan"] == "pro" and summary["trial_ends_at"]

    discounted = client.post(url, headers=auth_header(boss), json={"action": "discount", "percent": 50, "months": 3}).json()["data"]
    assert discounted["discount_percent"] == 50 and discounted["discount_months"] == 3
    assert client.post(url, headers=auth_header(boss), json={"action": "note", "note": "Friend of the founder"}).json()["data"]["admin_note"] == "Friend of the founder"

    detail = client.get(f"/platform/organizations/{taco}", headers=auth_header(boss)).json()["data"]
    assert [item["action"] for item in detail["log"]] == ["note", "discount", "extend", "cancel", "set_plan"]
    assert all(item["actor_email"] == "me@plato-hq.com" for item in detail["log"])


def test_delete_needs_the_exact_name_and_never_your_own_business(client, monkeypatch):
    boss, customer, taco = _setup(client, monkeypatch)
    assert client.request("DELETE", f"/platform/organizations/{taco}", headers=auth_header(boss), json={"confirm_name": "taco stand"}).status_code == 422
    deleted = client.request("DELETE", f"/platform/organizations/{taco}", headers=auth_header(boss), json={"confirm_name": "Taco Stand"})
    assert deleted.status_code == 200, deleted.text
    assert [item["name"] for item in client.get("/platform/organizations", headers=auth_header(boss)).json()["data"]] == ["Platofy HQ"]
    # Its only owner is gone with it.
    assert client.post("/auth/login", json={"email": "owner@taco-stand.com", "password": "ADMIN123!"}).status_code == 404

    own = client.get("/platform/organizations", headers=auth_header(boss)).json()["data"][0]["id"]
    assert client.request("DELETE", f"/platform/organizations/{own}", headers=auth_header(boss), json={"confirm_name": "Platofy HQ"}).status_code == 422
    # The log survives the deletion.
    assert any(item["action"] == "delete_business" and item["organization_name"] == "Taco Stand" for item in client.get("/platform/audit", headers=auth_header(boss)).json()["data"])
