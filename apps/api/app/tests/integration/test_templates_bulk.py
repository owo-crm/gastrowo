from __future__ import annotations

from app.tests.integration.test_api_flow import auth_header, signup_ADMIN


def _shift(location_id: str, day: int, start="09:00:00", end="17:00:00", count=1, position="Server") -> dict:
    return {
        "location_id": location_id,
        "day_of_week": day,
        "template_name": position,
        "start_time": start,
        "end_time": end,
        "required_role": "STAFF",
        "staff_position": position,
        "required_count": count,
    }


def _list(client, token, location_id):
    return client.get(f"/schedule/templates?location_id={location_id}", headers=auth_header(token)).json()["data"]


def test_bulk_create_update_delete_in_one_go(client):
    token, location_id = signup_ADMIN(client, organization_name="Bulk Diner", email="owner@bulk.com")
    h = auth_header(token)
    created = client.post("/schedule/templates/bulk", headers=h, json={"create": [_shift(location_id, day) for day in range(5)]})
    assert created.status_code == 200 and created.json()["data"]["created"] == 5
    rows = _list(client, token, location_id)
    assert sorted(item["day_of_week"] for item in rows) == [0, 1, 2, 3, 4]

    # Edit the Mon–Fri shift: new time on Mon–Thu, drop Friday, add Saturday.
    friday = next(item for item in rows if item["day_of_week"] == 4)
    keep = [item for item in rows if item["day_of_week"] != 4]
    body = {
        "update": [{**_shift(location_id, item["day_of_week"], "10:00:00", "18:00:00", 2), "id": item["id"], "is_active": True} for item in keep],
        "delete": [friday["id"]],
        "create": [_shift(location_id, 5, "10:00:00", "18:00:00", 2)],
    }
    assert client.post("/schedule/templates/bulk", headers=h, json=body).status_code == 200
    rows = _list(client, token, location_id)
    assert sorted(item["day_of_week"] for item in rows) == [0, 1, 2, 3, 5]
    assert {(item["start_time"], item["required_count"]) for item in rows} == {("10:00:00", 2)}


def test_bulk_is_all_or_nothing_and_stays_inside_the_business(client):
    token, location_id = signup_ADMIN(client, organization_name="Bulk Diner", email="owner@bulk.com")
    other_token, other_location = signup_ADMIN(client, organization_name="Other Place", email="owner@other.com")
    h = auth_header(token)
    # A location from another business: nothing is created, not even the valid first item.
    bad = client.post("/schedule/templates/bulk", headers=h, json={"create": [_shift(location_id, 0), _shift(other_location, 1)]})
    assert bad.status_code == 404
    assert _list(client, token, location_id) == []
    # Nor can one business delete another's templates.
    client.post("/schedule/templates/bulk", headers=auth_header(other_token), json={"create": [_shift(other_location, 0)]})
    theirs = _list(client, other_token, other_location)[0]["id"]
    assert client.post("/schedule/templates/bulk", headers=h, json={"delete": [theirs]}).status_code == 404
    assert len(_list(client, other_token, other_location)) == 1
