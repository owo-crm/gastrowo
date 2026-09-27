from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.security import create_access_token
from app.models import (
    Organization,
    OrganizationMembership,
    OrganizationSubscription,
    RoleEnum,
    SubscriptionPlanEnum,
    SubscriptionStatusEnum,
    User,
)


def _workspace(db_session, *, members: int, plan: SubscriptionPlanEnum, status: SubscriptionStatusEnum, trial_ends_at=None):
    org = Organization(name=f"Billing {plan.value} {members}")
    admin = User(email=f"admin-{plan.value}-{members}@billing-example.com", full_name="Admin", password_hash="")
    db_session.add_all([org, admin])
    db_session.flush()
    db_session.add(OrganizationMembership(organization_id=org.id, user_id=admin.id, role=RoleEnum.ADMIN, max_hours_per_week=40))
    for index in range(members - 1):
        worker = User(email=f"w{index}-{plan.value}-{members}@billing-example.com", full_name=f"Worker {index}", password_hash="")
        db_session.add(worker)
        db_session.flush()
        db_session.add(OrganizationMembership(organization_id=org.id, user_id=worker.id, role=RoleEnum.STAFF, max_hours_per_week=40))
    db_session.add(OrganizationSubscription(organization_id=org.id, plan=plan, status=status, billing_cycle="monthly", trial_ends_at=trial_ends_at))
    db_session.commit()
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), str(org.id))}"}


def test_expired_trial_falls_back_to_free_with_member_limit(client, db_session):
    headers = _workspace(
        db_session,
        members=5,
        plan=SubscriptionPlanEnum.PRO,
        status=SubscriptionStatusEnum.TRIALING,
        trial_ends_at=datetime.now(UTC) - timedelta(days=1),
    )
    summary = client.get("/organizations/current/subscription", headers=headers).json()["data"]
    assert summary["plan"] == "free"
    assert summary["member_cap"] == 5
    assert summary["location_cap"] is None

    sixth = client.post("/organizations/members/link-by-email", headers=headers, json={"email": "sixth@billing-example.com"})
    assert sixth.status_code == 402


def test_pro_has_no_member_or_location_limits(client, db_session):
    headers = _workspace(
        db_session,
        members=30,
        plan=SubscriptionPlanEnum.PRO,
        status=SubscriptionStatusEnum.TRIALING,
        trial_ends_at=datetime.now(UTC) + timedelta(days=10),
    )
    summary = client.get("/organizations/current/subscription", headers=headers).json()["data"]
    assert summary["plan"] == "pro"
    assert summary["member_cap"] is None
    assert summary["billable_seats"] == 30

    invite = client.post("/organizations/members/link-by-email", headers=headers, json={"email": "thirty-one@billing-example.com"})
    assert invite.status_code == 200


def test_free_plan_can_add_many_locations(client, db_session):
    headers = _workspace(db_session, members=1, plan=SubscriptionPlanEnum.FREE, status=SubscriptionStatusEnum.ACTIVE)
    for name in ("Gdynia", "Sopot", "Gdańsk"):
        created = client.post("/locations", headers=headers, json={"name": name, "timezone": "Europe/Warsaw"})
        assert created.status_code == 200, created.text
