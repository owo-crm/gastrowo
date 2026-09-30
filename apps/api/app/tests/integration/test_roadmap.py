from __future__ import annotations

from app.tests.integration.test_api_flow import auth_header, invite_accept_login, signup_ADMIN


def test_roadmap_ticks_itself_off_and_can_be_hidden(client, db_session):
    admin, location_id = signup_ADMIN(client, organization_name="Road Diner", email="owner@road-diner.com")
    data = client.get("/organizations/current/roadmap", headers=auth_header(admin)).json()["data"]
    assert data["total"] == 12 and data["done_count"] == 0 and not data["hidden"]
    assert [step["key"] for step in data["steps"]][:3] == ["profile", "location", "positions"]

    # Real actions tick steps: a photo, a renamed location, someone joining.
    client.patch("/users/me", headers=auth_header(admin), json={"full_name": "Owner One", "avatar_url": "data:image/png;base64,AAAA"})
    location = client.get("/locations", headers=auth_header(admin)).json()["data"][0]
    client.patch(f"/locations/{location['id']}", headers=auth_header(admin), json={"name": "Road Diner Center", "timezone": "America/New_York"})
    staff = invite_accept_login(client, ADMIN_token=admin, email="cook@road-diner.com", full_name="Casey Cook", location_id=location_id)
    done = {step["key"] for step in client.get("/organizations/current/roadmap", headers=auth_header(admin)).json()["data"]["steps"] if step["done"]}
    assert {"profile", "location", "invite", "joined"} <= done

    # Staff can't see or hide it; the owner hides it for good.
    assert client.get("/organizations/current/roadmap", headers=auth_header(staff)).status_code == 403
    assert client.post("/organizations/current/roadmap/hide", headers=auth_header(admin)).status_code == 200
    assert client.get("/auth/me", headers=auth_header(admin)).json()["data"]["organization_settings"]["roadmap_hidden"] is True


def test_old_accounts_dont_get_the_roadmap_or_tour_again(client, db_session):
    from datetime import UTC, datetime, timedelta

    from app.models import Organization, User

    admin, _ = signup_ADMIN(client, organization_name="Old Diner", email="owner@old-diner.com")
    me = client.get("/auth/me", headers=auth_header(admin)).json()["data"]
    assert me["show_tour"] is True and me["organization_settings"]["roadmap_hidden"] is False

    # Finishing the tour is remembered on the server, so a new device or domain doesn't replay it.
    assert client.post("/auth/me/tour-done", headers=auth_header(admin)).status_code == 200
    assert client.get("/auth/me", headers=auth_header(admin)).json()["data"]["show_tour"] is False

    # A business older than two weeks no longer gets the roadmap, and old users never get the tour.
    long_ago = datetime.now(UTC) - timedelta(days=30)
    user = db_session.query(User).filter_by(email="owner@old-diner.com").one()
    user.tour_completed_at = None
    user.created_at = long_ago
    db_session.query(Organization).filter_by(name="Old Diner").one().created_at = long_ago
    db_session.commit()
    me = client.get("/auth/me", headers=auth_header(admin)).json()["data"]
    assert me["show_tour"] is False and me["organization_settings"]["roadmap_hidden"] is True
    assert client.get("/organizations/current/roadmap", headers=auth_header(admin)).json()["data"]["hidden"] is True
