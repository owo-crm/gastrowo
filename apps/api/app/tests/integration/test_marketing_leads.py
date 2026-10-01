from __future__ import annotations

from app.routers import marketing
from app.tests.integration.test_api_flow import auth_header, platform_session, signup_ADMIN


def test_leads_are_stored_switch_requests_notify_the_team(client, monkeypatch):
    from app.core.config import settings

    marketing._recent.clear()
    boss, _ = signup_ADMIN(client, organization_name="Platofy HQ", email="me@plato-hq.com")
    monkeypatch.setattr(settings, "platform_admin_emails", "me@plato-hq.com")
    boss_admin = platform_session(client, "me@plato-hq.com")

    assert client.post("/marketing/leads", json={"email": "Owner@Diner.com", "kind": "template", "source": "schedule-template"}).status_code == 200
    switch = {"email": "gm@tacos.com", "kind": "migration", "name": "Ana", "business": "Taco Place", "current_tool": "7shifts", "team_size": "15-30", "message": "Export attached later"}
    assert client.post("/marketing/leads", json=switch).status_code == 200
    # Honeypot: accepted quietly, not stored.
    assert client.post("/marketing/leads", json={"email": "bot@spam.com", "kind": "template", "website": "http://spam"}).status_code == 200
    assert client.post("/marketing/leads", json={"email": "not-an-email", "kind": "template"}).status_code == 422

    leads = client.get("/platform/leads", headers=auth_header(boss_admin)).json()["data"]
    assert [lead["email"] for lead in leads] == ["gm@tacos.com", "owner@diner.com"]
    bell = client.get("/notifications", headers=auth_header(boss)).json()["data"]
    assert bell["items"][0]["title"] == "New switch-over request" and "Taco Place" in bell["items"][0]["body"]

    customer, _ = signup_ADMIN(client, organization_name="Taco Stand", email="owner@taco-stand.com")
    assert client.get("/platform/leads", headers=auth_header(customer)).status_code == 401


def test_leads_are_rate_limited_per_network(client):
    marketing._recent.clear()
    codes = [client.post("/marketing/leads", json={"email": f"a{i}@x.com", "kind": "calculator"}).status_code for i in range(12)]
    assert codes[:10] == [200] * 10 and codes[10:] == [429, 429]
