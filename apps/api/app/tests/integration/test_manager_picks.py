from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from app.models import Assignment, OrganizationMembership, RoleEnum, Shift, User
from app.tests.integration.test_api_flow import (
    auth_header,
    current_monday,
    get_user_id,
    invite_accept_login,
    signup_ADMIN,
    submit_staff_availability,
)


def _place(client, admin, location_id, week, *, user_id, day, role, position, start="10:00:00", end="18:00:00"):
    response = client.patch(
        "/schedule/preview/edits",
        headers=auth_header(admin),
        json={
            "week_start": week.isoformat(),
            "action": "create",
            "shift_key": f"create:{user_id}:{day}",
            "location_id": location_id,
            "day_of_week": day,
            "start_time": start,
            "end_time": end,
            "required_role": role,
            "staff_position": position,
            "required_count": 1,
            "assigned_user_id": user_id,
        },
    )
    assert response.status_code == 200, response.text


def test_the_managers_pick_is_placed_even_off_day_or_off_position(client, db_session):
    admin, location_id = signup_ADMIN(client, organization_name="Picks Diner", email="owner@picks-diner.com")
    week = current_monday()
    server_token = invite_accept_login(client, ADMIN_token=admin, email="server@picks-diner.com", full_name="Sara Server", location_id=location_id)
    invite_accept_login(client, ADMIN_token=admin, email="boss@picks-diner.com", full_name="Mo Manager", location_id=location_id)
    server_id = get_user_id(client, token=admin, email="server@picks-diner.com")
    manager_id = get_user_id(client, token=admin, email="boss@picks-diner.com")
    assert client.patch(f"/users/{server_id}/position", headers=auth_header(admin), json={"staff_position": "Server"}).status_code == 200
    manager = db_session.scalar(select(OrganizationMembership).where(OrganizationMembership.user_id == UUID(manager_id)))
    manager.role = RoleEnum.MANAGER
    db_session.commit()

    # Sara said she is free only 18:00-22:00, and she is a server, not a cook.
    submit_staff_availability(client, staff_token=server_token, week_start=week, desired_hours=10, start_time="18:00:00", end_time="22:00:00")

    _place(client, admin, location_id, week, user_id=server_id, day=0, role="STAFF", position="Server")  # outside her hours
    _place(client, admin, location_id, week, user_id=server_id, day=1, role="STAFF", position="Line cook")  # other position
    _place(client, admin, location_id, week, user_id=manager_id, day=2, role="STAFF", position="Line cook")  # manager as cook

    applied = client.post("/schedule/generate/apply", headers=auth_header(admin), json={"week_start": week.isoformat(), "location_id": location_id})
    assert applied.status_code == 200, applied.text

    rows = db_session.execute(select(Shift, Assignment).join(Assignment, Assignment.shift_id == Shift.id).where(Shift.date >= week)).all()
    placed = {(shift.date.weekday(), str(assignment.user_id), shift.staff_position, shift.required_role) for shift, assignment in rows}
    assert (0, server_id, "Server", RoleEnum.STAFF) in placed
    assert (1, server_id, "Line cook", RoleEnum.STAFF) in placed
    assert (2, manager_id, "Line cook", RoleEnum.STAFF) in placed

    # The manager is still a manager; only this shift is a cook shift.
    assert db_session.scalar(select(OrganizationMembership.role).where(OrganizationMembership.user_id == UUID(manager_id))) == RoleEnum.MANAGER
    assert db_session.get(User, manager.user_id) is not None
