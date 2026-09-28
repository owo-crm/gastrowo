from __future__ import annotations

from app.tests.integration.test_api_flow import auth_header, signup_ADMIN


def test_import_invites_many_and_applies_position_and_rate_on_join(client):
    admin, location_id = signup_ADMIN(client, organization_name="Import Diner", email="owner@import-diner.com")
    result = client.post(
        "/organizations/members/import",
        headers=auth_header(admin),
        json={
            "rows": [
                {"email": "Ana@import-diner.com", "name": "Ana Cook", "position": "Line cook", "rate": "21.50"},
                {"email": "ben@import-diner.com", "name": "Ben", "position": "Server"},
                {"email": "ana@import-diner.com", "name": "Ana again"},
                {"email": "not-an-email"},
                {"email": "owner@import-diner.com"},
            ]
        },
    ).json()["data"]
    assert result["invited"] == ["ana@import-diner.com", "ben@import-diner.com"]
    assert {item["reason"] for item in result["skipped"]} == {"duplicate", "invalid_email", "has_account"}

    from app.models import InviteToken
    from app.tests.conftest import TestingSessionLocal

    token_value = TestingSessionLocal().query(InviteToken).filter(InviteToken.email == "ana@import-diner.com").one().token

    lookup = client.get(f"/auth/invites/lookup?token={token_value}&email=ana@import-diner.com").json()["data"]
    assert lookup == {"business_name": "Import Diner", "full_name": "Ana Cook", "expired": False}

    joined = client.post("/auth/invites/join/accept", json={"email": "ana@import-diner.com", "invite_token": token_value, "full_name": "Ana Cook", "password": "Passw0rd!"})
    assert joined.status_code == 200, joined.text
    users = client.get("/users", headers=auth_header(admin)).json()["data"]
    ana = next(item for item in users if item["email"] == "ana@import-diner.com")
    assert ana["staff_position"] == "Line cook"
    members = client.get(f"/locations/{location_id}/members", headers=auth_header(admin)).json()["data"]
    assert next(item for item in members if item["email"] == "ana@import-diner.com")["hourly_rate_pln"] == "21.50"


def test_import_respects_the_free_plan_limit(client):
    admin, _ = signup_ADMIN(client, organization_name="Tiny Diner", email="owner@tiny-diner.com")
    # Force Free: 15 people including the owner.
    from app.models import OrganizationSubscription, SubscriptionPlanEnum, SubscriptionStatusEnum
    from app.tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    subscription = db.query(OrganizationSubscription).one()
    subscription.plan, subscription.status, subscription.trial_ends_at = SubscriptionPlanEnum.FREE, SubscriptionStatusEnum.ACTIVE, None
    db.commit()
    rows = [{"email": f"p{index}@tiny-diner.com"} for index in range(20)]
    result = client.post("/organizations/members/import", headers=auth_header(admin), json={"rows": rows}).json()["data"]
    assert len(result["invited"]) == 14
    assert sum(item["reason"] == "plan_limit" for item in result["skipped"]) == 6
