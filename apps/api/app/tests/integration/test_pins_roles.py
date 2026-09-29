from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from app.models import Organization, OrganizationMembership
from app.services.billing import grant_comp_pro
from app.tests.integration.test_api_flow import auth_header, get_user_id, invite_accept_login, signup_ADMIN


def _team(client, db_session, name="pins"):
    admin, location_id = signup_ADMIN(client, organization_name=f"{name} Diner", email=f"owner@{name}-diner.com")
    cook = invite_accept_login(client, ADMIN_token=admin, email=f"cook@{name}-diner.com", full_name="Casey Cook", location_id=location_id)
    boss = invite_accept_login(client, ADMIN_token=admin, email=f"boss@{name}-diner.com", full_name="Mo Manager", location_id=location_id)
    cook_id = get_user_id(client, token=admin, email=f"cook@{name}-diner.com")
    boss_id = get_user_id(client, token=admin, email=f"boss@{name}-diner.com")
    return admin, cook, boss, location_id, cook_id, boss_id


def test_every_member_gets_a_readable_pin_that_can_be_changed(client, db_session):
    admin, cook, _boss, _location_id, cook_id, _boss_id = _team(client, db_session)
    memberships = db_session.scalars(select(OrganizationMembership)).all()
    assert memberships and all(item.clock_pin_encrypted and item.clock_pin_digest for item in memberships)

    own = client.get("/clock/me", headers=auth_header(cook)).json()["data"]["pin"]
    card = client.get(f"/workers/{cook_id}/setup", headers=auth_header(admin)).json()["data"]["clock_pin"]
    assert own == card and own.isdigit() and len(own) == 4
    # Asking again returns the same PIN, it does not vanish or change.
    assert client.get(f"/workers/{cook_id}/setup", headers=auth_header(admin)).json()["data"]["clock_pin"] == own

    changed = client.put(f"/clock/pins/{cook_id}", headers=auth_header(admin), json={"pin": "2468"})
    assert changed.status_code == 200 and changed.json()["data"]["pin"] == "2468"
    assert client.get("/clock/me", headers=auth_header(cook)).json()["data"]["pin"] == "2468"
    admin_pin = client.get("/clock/me", headers=auth_header(admin)).json()["data"]["pin"]
    assert client.put(f"/clock/pins/{cook_id}", headers=auth_header(admin), json={"pin": admin_pin}).status_code == 409


def test_only_a_manager_pin_closes_the_tablet(client, db_session):
    admin, _cook, _boss, location_id, cook_id, boss_id = _team(client, db_session, "exit")
    assert client.patch(f"/workers/{boss_id}/role", headers=auth_header(admin), json={"role": "MANAGER"}).status_code == 200
    device = {"X-Kiosk-Token": client.post("/clock/kiosks", headers=auth_header(admin), json={"location_id": location_id}).json()["data"]["token"]}
    cook_pin = client.get(f"/workers/{cook_id}/setup", headers=auth_header(admin)).json()["data"]["clock_pin"]
    boss_pin = client.get(f"/workers/{boss_id}/setup", headers=auth_header(admin)).json()["data"]["clock_pin"]
    assert client.post("/kiosk/exit", headers=device, json={"pin": cook_pin}).status_code == 403
    assert client.post("/kiosk/exit", headers=device, json={"pin": boss_pin}).status_code == 200

    device_id = client.get("/kiosk/device", headers=device).json()["data"]["id"]
    renamed = client.patch(f"/clock/kiosks/{device_id}", headers=auth_header(admin), json={"name": "Kitchen door"})
    assert renamed.status_code == 200
    assert client.get("/kiosk/device", headers=device).json()["data"]["name"] == "Kitchen door"


def test_role_is_set_by_the_owner_and_not_by_position(client, db_session):
    admin, _cook, boss, _location_id, cook_id, boss_id = _team(client, db_session, "roles")
    assert client.patch(f"/users/{cook_id}/position", headers=auth_header(admin), json={"staff_position": "Manager"}).status_code == 200
    assert client.get(f"/workers/{cook_id}/setup", headers=auth_header(admin)).json()["data"]["role"] == "STAFF"

    assert client.patch(f"/workers/{boss_id}/role", headers=auth_header(admin), json={"role": "MANAGER"}).status_code == 200
    assert client.get(f"/workers/{boss_id}/setup", headers=auth_header(admin)).json()["data"]["role"] == "MANAGER"
    # A manager can't promote people or change the owner.
    assert client.patch(f"/workers/{cook_id}/role", headers=auth_header(boss), json={"role": "MANAGER"}).status_code == 403


def test_managers_cannot_change_manager_permissions(client, db_session):
    admin, _cook, boss, _location_id, cook_id, boss_id = _team(client, db_session, "perms")
    org_id = db_session.scalar(select(OrganizationMembership.organization_id).where(OrganizationMembership.user_id == UUID(boss_id)))
    grant_comp_pro(db_session, org_id)
    org = db_session.get(Organization, org_id)
    org.manager_can_manage_business_settings = True
    db_session.commit()
    assert client.patch(f"/workers/{boss_id}/role", headers=auth_header(admin), json={"role": "MANAGER"}).status_code == 200

    settings = client.get("/auth/me", headers=auth_header(boss)).json()["data"]["organization_settings"]
    patch = {key: value for key, value in settings.items() if key.startswith(("staff_can_", "manager_can_"))}
    patch.update({"staff_can_submit_revenue_reports": True, "manager_can_view_payroll": True})
    assert client.patch("/organizations/current/settings", headers=auth_header(boss), json=patch).status_code == 200
    db_session.expire_all()
    org = db_session.get(Organization, org_id)
    assert org.staff_can_submit_revenue_reports is True
    assert org.manager_can_view_payroll is False

    locations = client.get(f"/workers/{boss_id}/setup", headers=auth_header(admin)).json()["data"]["locations"]
    body = {"locations": [{"location_id": item["location_id"], "priority": 3, "hourly_rate_pln": "20"} for item in locations], "permission_overrides": {"manager_can_view_payroll_override": True}}
    assert client.patch(f"/workers/{boss_id}/setup", headers=auth_header(boss), json=body).status_code == 403
    staff_body = {**body, "permission_overrides": {"staff_can_submit_revenue_reports_override": False}}
    assert client.patch(f"/workers/{cook_id}/setup", headers=auth_header(boss), json=staff_body).status_code == 200
