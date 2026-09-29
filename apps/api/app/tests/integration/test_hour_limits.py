from __future__ import annotations

from app.tests.integration.test_api_flow import (
    auth_header,
    create_template,
    current_monday,
    get_user_id,
    invite_accept_login,
    signup_ADMIN,
    submit_staff_availability,
)


def _setup(client, name: str):
    admin, location_id = signup_ADMIN(client, organization_name=f"{name} Diner", email=f"owner@{name}-diner.com")
    staff = invite_accept_login(client, ADMIN_token=admin, email=f"cook@{name}-diner.com", full_name="Cody Cook", location_id=location_id)
    staff_id = get_user_id(client, token=admin, email=f"cook@{name}-diner.com")
    patch = client.patch(f"/locations/{location_id}/members/{staff_id}", headers=auth_header(admin), json={"hourly_rate_pln": "18.00", "priority": 5, "max_hours_per_week": 40})
    assert patch.status_code == 200
    week = current_monday()
    # Wants 16 h, but there is an 8 h shift every day of the week.
    assert submit_staff_availability(client, staff_token=staff, week_start=week, desired_hours=16).status_code == 200
    for day in range(7):
        create_template(client, ADMIN_token=admin, location_id=location_id, day_of_week=day)
    return admin, location_id, week


def _generate(client, admin, location_id, week):
    response = client.post("/schedule/generate", headers=auth_header(admin), json={"week_start": week.isoformat(), "location_id": location_id})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_auto_schedule_keeps_hour_limits_by_default(client):
    admin, location_id, week = _setup(client, "limits")
    assert client.get("/auth/me", headers=auth_header(admin)).json()["data"]["organization_settings"]["schedule_respect_hour_limits"] is True
    assert _generate(client, admin, location_id, week)["created_assignments"] == 2


def test_auto_schedule_can_go_over_hour_limits_with_a_warning(client):
    admin, location_id, week = _setup(client, "nolimits")
    changed = client.patch("/organizations/current/scheduling", headers=auth_header(admin), json={"respect_hour_limits": False})
    assert changed.status_code == 200, changed.text
    assert client.get("/auth/me", headers=auth_header(admin)).json()["data"]["organization_settings"]["schedule_respect_hour_limits"] is False

    result = _generate(client, admin, location_id, week)
    assert result["created_assignments"] == 7
    assert any("over hour limit" in warning for warning in result["warnings"])
