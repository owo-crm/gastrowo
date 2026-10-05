from __future__ import annotations

from app.services import signup_alerts
from app.tests.integration.test_api_flow import signup_ADMIN


def test_new_business_emails_the_team(client, monkeypatch):
    from app.core.config import settings

    sent: list[dict] = []
    monkeypatch.setattr(signup_alerts, "send_notice_email", lambda **kwargs: sent.append(kwargs))
    monkeypatch.setattr(settings, "platform_admin_emails", "me@plato-hq.com, ops@plato-hq.com")

    signup_ADMIN(client, organization_name="Taco Stand", email="owner@taco-stand.com")

    assert sorted(mail["email"] for mail in sent) == ["me@plato-hq.com", "ops@plato-hq.com"]
    assert sent[0]["subject"] == "New restaurant on Platofy: Taco Stand"
    assert "owner@taco-stand.com" in sent[0]["text"] and "Heard about us: Google" in sent[0]["text"]


def test_no_team_addresses_no_email(client, monkeypatch):
    from app.core.config import settings

    sent: list[dict] = []
    monkeypatch.setattr(signup_alerts, "send_notice_email", lambda **kwargs: sent.append(kwargs))
    monkeypatch.setattr(settings, "platform_admin_emails", "")

    signup_ADMIN(client, organization_name="Quiet Diner", email="owner@quiet-diner.com")
    assert sent == []
