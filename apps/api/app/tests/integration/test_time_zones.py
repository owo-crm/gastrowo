from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

import pytest

from app.services import labor_rules
from app.tests.integration.test_api_flow import auth_header, sent_code


def _owner(client, email: str, name: str, **extra) -> str:
    assert client.post("/auth/otp/send", json={"email": email, "purpose": "owner_signup"}).status_code == 200
    verify = client.post("/auth/otp/verify", json={"email": email, "code": sent_code(email), "purpose": "owner_signup"})
    complete = client.post(
        "/auth/onboarding/owner/complete",
        json={
            "verification_token": verify.json()["data"]["verification_token"],
            "organization_name": name,
            "full_name": "Owner One",
            "password": "Owner123!",
            "source": "Google",
            **extra,
        },
    )
    assert complete.status_code == 200, complete.text
    return complete.json()["data"]["access_token"]


def test_first_location_starts_in_the_owners_device_zone(client):
    token = _owner(client, "owner@chicago-diner.com", "Chicago Diner", country="US", timezone="America/Chicago")
    assert client.get("/locations", headers=auth_header(token)).json()["data"][0]["timezone"] == "America/Chicago"

    # Missing or made-up zones fall back to the country's default.
    fallback = _owner(client, "owner@nowhere-diner.com", "Nowhere Diner", country="US", timezone="Mars/Olympus_Mons")
    assert client.get("/locations", headers=auth_header(fallback)).json()["data"][0]["timezone"] == "America/New_York"
    polish = _owner(client, "owner@bistro.pl", "Bistro Gdańsk", country="PL")
    assert client.get("/locations", headers=auth_header(polish)).json()["data"][0]["timezone"] == "Europe/Warsaw"


def test_locations_only_accept_real_zones(client):
    token = _owner(client, "owner@la-diner.com", "LA Diner", timezone="America/Los_Angeles")
    location = client.get("/locations", headers=auth_header(token)).json()["data"][0]
    bad = client.patch(f"/locations/{location['id']}", headers=auth_header(token), json={"name": location["name"], "timezone": "Not/AZone"})
    assert bad.status_code == 422
    good = client.patch(f"/locations/{location['id']}", headers=auth_header(token), json={"name": location["name"], "timezone": "America/Denver"})
    assert good.status_code == 200


def test_today_is_the_restaurants_day_not_the_servers(client, db_session, monkeypatch: pytest.MonkeyPatch):
    token = _owner(client, "owner@ny-diner.com", "NY Diner", timezone="America/New_York")
    org_id = UUID(client.get("/auth/me", headers=auth_header(token)).json()["data"]["active_organization_id"])

    # 03:30 UTC on Oct 1 is still 23:30 on Sep 30 in New York.
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            moment = datetime(2026, 10, 1, 3, 30, tzinfo=UTC)
            return moment.astimezone(tz) if tz else moment.replace(tzinfo=None)

    monkeypatch.setattr(labor_rules, "datetime", Frozen)
    assert labor_rules.local_today(db_session, org_id) == date(2026, 9, 30)


def test_signup_survey_is_stored_and_shown_to_platform_staff(client, db_session, monkeypatch: pytest.MonkeyPatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "platform_admin_emails", "owner@survey-diner.com")
    token = _owner(
        client,
        "owner@survey-diner.com",
        "Survey Diner",
        source="Facebook",
        business_type="cafe",
        team_size="11-25",
        previous_tool="excel",
    )
    rows = client.get("/platform/organizations", headers=auth_header(token)).json()["data"]
    row = next(item for item in (rows["items"] if isinstance(rows, dict) else rows) if item["name"] == "Survey Diner")
    assert row["survey"] == {"business_type": "cafe", "team_size": "11-25", "previous_tool": "excel", "source": "Facebook"}
