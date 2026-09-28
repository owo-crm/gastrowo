from __future__ import annotations

from app.tests.integration.test_api_flow import auth_header, get_user_id, invite_accept_login, signup_ADMIN


def _notices(client, token):
    return [item for item in client.get("/notifications", headers=auth_header(token)).json()["data"]["items"] if item["type"] == "task"]


def test_only_the_assignee_hears_about_a_task_and_the_author_hears_it_is_done(client):
    admin, location_id = signup_ADMIN(client, organization_name="Notice Diner", email="owner@notice-diner.com")
    staff = invite_accept_login(client, ADMIN_token=admin, email="cook@notice-diner.com", full_name="Cook", location_id=location_id)
    admin_id = get_user_id(client, token=admin, email="owner@notice-diner.com")
    staff_id = get_user_id(client, token=admin, email="cook@notice-diner.com")

    # A task you give yourself makes no noise.
    assert client.post("/tasks", headers=auth_header(admin), json={"title": "Call the supplier", "description": "", "assigned_to": admin_id}).status_code == 200
    assert _notices(client, admin) == []

    created = client.post("/tasks", headers=auth_header(admin), json={"title": "Clean the fryer", "description": "", "assigned_to": staff_id})
    task_id = created.json()["data"]["id"]
    assert [item["title"] for item in _notices(client, staff)] == ["New task"]
    assert _notices(client, admin) == []

    assert client.patch(f"/tasks/{task_id}", headers=auth_header(staff), json={"status": "done"}).status_code == 200
    assert [item["title"] for item in _notices(client, admin)] == ["Task done"]
    assert len(_notices(client, staff)) == 1

    # Deleting the task takes its notices with it.
    assert client.delete(f"/tasks/{task_id}", headers=auth_header(admin)).status_code == 200
    assert _notices(client, staff) == [] and _notices(client, admin) == []
