from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.core.config import settings
from app.models import ClockSession, Organization, RevenueReport, ShiftRequest, Task, TaskPhoto, User
from app.services import sandbox as sandbox_service
from app.tests.integration.test_api_flow import auth_header, signup_ADMIN


def _demo(client, country="US"):
    response = client.post("/auth/demo", json={"country": country})
    assert response.status_code == 200, response.text
    return response.json()["data"]["access_token"]


def test_every_visitor_gets_a_separate_month_of_demo_data(client, db_session):
    sandbox_service._created_by_ip.clear()
    first = _demo(client)
    second = _demo(client)
    me = client.get("/auth/me", headers=auth_header(first)).json()["data"]
    other = client.get("/auth/me", headers=auth_header(second)).json()["data"]
    assert me["is_sandbox"] is True and me["sandbox_expires_at"]
    assert me["role"] == "ADMIN" and me["active_organization_id"] != other["active_organization_id"]

    org_id = me["active_organization_id"]
    organization = db_session.get(Organization, __import__("uuid").UUID(org_id))
    oldest = db_session.scalar(select(func.min(RevenueReport.report_date)).where(RevenueReport.organization_id == organization.id))
    assert (datetime.now(UTC).date() - oldest).days >= 27
    assert db_session.scalar(select(func.count(RevenueReport.id)).where(RevenueReport.organization_id == organization.id, RevenueReport.photo_url.is_not(None))) > 0
    assert db_session.scalar(select(func.count(TaskPhoto.id)).join(Task, Task.id == TaskPhoto.task_id).where(Task.organization_id == organization.id)) > 0
    assert db_session.scalar(select(func.count(ShiftRequest.id)).where(ShiftRequest.organization_id == organization.id)) >= 4

    # One visitor's team is not visible to another.
    people = client.get("/workers", headers=auth_header(first))
    if people.status_code == 200:
        names = {item.get("full_name") for item in people.json()["data"]}
        assert names and all("visitor." not in (name or "") for name in names)


def test_demo_turns_off_kiosk_billing_and_invites(client, db_session):
    sandbox_service._created_by_ip.clear()
    token = _demo(client)
    me = client.get("/auth/me", headers=auth_header(token)).json()["data"]
    locations = client.get("/locations", headers=auth_header(token)).json()["data"]
    blocked = [
        client.post("/clock/kiosks", headers=auth_header(token), json={"location_id": locations[0]["id"]}),
        client.post("/billing/checkout-session", headers=auth_header(token), json={"plan": "pro", "billing_cycle": "monthly"}),
        client.post("/organizations/members/link-by-email", headers=auth_header(token), json={"email": "someone@example.com"}),
        client.post("/push/subscribe", headers=auth_header(token), json={}),
    ]
    assert all(item.status_code == 403 for item in blocked), [item.status_code for item in blocked]
    assert blocked[0].json()["error"]["code"] == "DEMO_FEATURE_OFF"
    # Everything else works as usual.
    assert client.get("/schedule/requests", headers=auth_header(token)).status_code == 200
    assert me["subscription"]

    # Renaming keeps the demo's suffix, so the real name stays free for a real business.
    renamed = client.patch("/organizations/current", headers=auth_header(token), json={"name": "Real Diner"})
    assert renamed.status_code == 200 and renamed.json()["data"]["name"] == "Real Diner"
    assert client.get("/auth/me", headers=auth_header(token)).json()["data"]["active_organization_name"] == "Real Diner"

    # A real business is not affected by the guard.
    admin, location_id = signup_ADMIN(client, organization_name="Real Diner", email="owner@real-diner.com")
    assert client.post("/clock/kiosks", headers=auth_header(admin), json={"location_id": location_id}).status_code == 200


def test_expired_demo_is_deleted_with_its_people(client, db_session):
    sandbox_service._created_by_ip.clear()
    token = _demo(client)
    org_id = client.get("/auth/me", headers=auth_header(token)).json()["data"]["active_organization_id"]
    organization = db_session.get(Organization, __import__("uuid").UUID(org_id))
    users_before = db_session.scalar(select(func.count(User.id)))
    organization.sandbox_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()
    assert sandbox_service.cleanup_expired(db_session) == 1
    assert db_session.get(Organization, organization.id) is None
    assert db_session.scalar(select(func.count(User.id))) < users_before - 10
    assert db_session.scalar(select(func.count(ClockSession.id)).where(ClockSession.organization_id == organization.id)) == 0
    assert client.get("/auth/me", headers=auth_header(token)).status_code == 401


def test_demo_rate_limit_and_switch(client, db_session, monkeypatch):
    sandbox_service._created_by_ip.clear()
    monkeypatch.setattr(settings, "public_demo_per_ip_per_hour", 2)
    _demo(client)
    _demo(client)
    assert client.post("/auth/demo", json={}).status_code == 429
    monkeypatch.setattr(settings, "public_demo_enabled", False)
    assert client.post("/auth/demo", json={}).status_code == 404
