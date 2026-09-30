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
        members=15,
        plan=SubscriptionPlanEnum.PRO,
        status=SubscriptionStatusEnum.TRIALING,
        trial_ends_at=datetime.now(UTC) - timedelta(days=1),
    )
    summary = client.get("/organizations/current/subscription", headers=headers).json()["data"]
    assert summary["plan"] == "free"
    assert summary["member_cap"] == 15
    assert summary["location_cap"] == 1

    sixteenth = client.post("/organizations/members/link-by-email", headers=headers, json={"email": "sixteenth@billing-example.com"})
    assert sixteenth.status_code == 402


def test_pro_has_no_member_limit_and_three_locations_included(client, db_session):
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
    assert summary["location_cap"] is None
    assert summary["included_locations"] == 3

    invite = client.post("/organizations/members/link-by-email", headers=headers, json={"email": "thirty-one@billing-example.com"})
    assert invite.status_code == 200
    for name in ("Brooklyn", "Queens", "Harlem"):
        assert client.post("/locations", headers=headers, json={"name": name, "timezone": "America/New_York"}).status_code == 200
    summary = client.get("/organizations/current/subscription", headers=headers).json()["data"]
    assert summary["billable_locations"] == 3
    assert summary["extra_locations"] == 0

    for name in ("Bronx", "Staten Island"):
        assert client.post("/locations", headers=headers, json={"name": name, "timezone": "America/New_York"}).status_code == 200
    assert client.get("/organizations/current/subscription", headers=headers).json()["data"]["extra_locations"] == 2


def test_free_plan_has_one_location(client, db_session):
    headers = _workspace(db_session, members=1, plan=SubscriptionPlanEnum.FREE, status=SubscriptionStatusEnum.ACTIVE)
    first = client.post("/locations", headers=headers, json={"name": "Brooklyn", "timezone": "America/New_York"})
    assert first.status_code == 200, first.text
    second = client.post("/locations", headers=headers, json={"name": "Queens", "timezone": "America/New_York"})
    assert second.status_code == 402
    assert "Pro" in second.json()["error"]["message"]


def test_starter_is_one_location_and_thirty_people(client, db_session):
    headers = _workspace(db_session, members=30, plan=SubscriptionPlanEnum.STANDARD, status=SubscriptionStatusEnum.ACTIVE)
    assert client.post("/locations", headers=headers, json={"name": "Brooklyn", "timezone": "America/New_York"}).status_code == 200
    summary = client.get("/organizations/current/subscription", headers=headers).json()["data"]
    assert summary["member_cap"] == 30
    assert summary["location_cap"] == 1
    assert summary["included_locations"] is None
    blocked = client.post("/organizations/members/link-by-email", headers=headers, json={"email": "thirty-one@billing-example.com"})
    assert blocked.status_code == 402

    second = client.post("/locations", headers=headers, json={"name": "Queens", "timezone": "America/New_York"})
    assert second.status_code == 402
    assert "Starter plan includes one location" in second.json()["error"]["message"]


def test_stripe_items_follow_extra_locations(monkeypatch):
    from app.core.config import settings
    from app.services.billing import stripe_items_update

    monkeypatch.setattr(settings, "stripe_price_pro_usd_monthly", "price_pro_m")
    monkeypatch.setattr(settings, "stripe_price_starter_usd_monthly", "price_starter_m")
    monkeypatch.setattr(settings, "stripe_price_pro_extra_location_usd_monthly", "price_extra_m")
    pro = {"id": "si_plan", "quantity": 1, "price": {"id": "price_pro_m"}}

    assert stripe_items_update([pro], 3) == []
    assert stripe_items_update([pro], 5) == [{"price": "price_extra_m", "quantity": 2}]
    extra = {"id": "si_extra", "quantity": 2, "price": {"id": "price_extra_m"}}
    assert stripe_items_update([pro, extra], 6) == [{"id": "si_extra", "quantity": 3}]
    assert stripe_items_update([pro, extra], 2) == [{"id": "si_extra", "deleted": True}]
    # Old per-location subscriptions are brought back to a single plan unit.
    assert stripe_items_update([{"id": "si_plan", "quantity": 4, "price": {"id": "price_pro_m"}}], 4) == [
        {"id": "si_plan", "quantity": 1},
        {"price": "price_extra_m", "quantity": 1},
    ]
    starter = {"id": "si_plan", "quantity": 1, "price": {"id": "price_starter_m"}}
    assert stripe_items_update([starter], 2) == []


def test_features_follow_the_plan(client, db_session):
    free = _workspace(db_session, members=2, plan=SubscriptionPlanEnum.FREE, status=SubscriptionStatusEnum.ACTIVE)
    standard = _workspace(db_session, members=3, plan=SubscriptionPlanEnum.STANDARD, status=SubscriptionStatusEnum.ACTIVE)
    pro = _workspace(db_session, members=4, plan=SubscriptionPlanEnum.PRO, status=SubscriptionStatusEnum.ACTIVE)
    period = {"start_date": "2026-09-01", "end_date": "2026-09-30"}

    assert client.get("/timesheets", headers=free).status_code == 402
    assert client.get("/payroll/summary", headers=free).status_code == 402

    assert client.get("/timesheets", headers=standard).status_code == 200
    assert client.get("/payroll/summary", headers=standard).status_code == 402
    assert client.get("/reports/revenue", headers=standard, params=period).status_code == 402

    assert client.get("/payroll/summary", headers=pro).status_code == 200
    assert client.get("/reports/revenue", headers=pro, params=period).status_code == 200

    features = client.get("/organizations/current/subscription", headers=standard).json()["data"]["features"]
    assert features == ["auto_schedule", "timesheets"]


def test_notifications_list_and_staff_can_read_locations(client, db_session):
    from uuid import UUID

    from app.models import InAppNotification, NotificationTypeEnum

    headers = _workspace(db_session, members=2, plan=SubscriptionPlanEnum.PRO, status=SubscriptionStatusEnum.ACTIVE)
    me = client.get("/auth/me", headers=headers).json()["data"]
    db_session.add(
        InAppNotification(
            organization_id=UUID(me["active_organization_id"]),
            user_id=UUID(me["id"]),
            type=NotificationTypeEnum.TEAM,
            title="Invite accepted",
            body="Kamil joined your business",
        )
    )
    db_session.commit()
    listed = client.get("/notifications", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["data"]["items"][0]["type"] == "team"
    staff_locations = client.get("/locations", headers=headers)
    assert staff_locations.status_code == 200


def test_staff_sees_coworkers_without_private_fields(client, db_session):
    from sqlalchemy import select

    _workspace(db_session, members=3, plan=SubscriptionPlanEnum.PRO, status=SubscriptionStatusEnum.ACTIVE)
    staff = db_session.scalar(select(OrganizationMembership).where(OrganizationMembership.role == RoleEnum.STAFF))
    headers = {"Authorization": f"Bearer {create_access_token(str(staff.user_id), str(staff.organization_id))}"}

    users = client.get("/users", headers=headers)
    assert users.status_code == 200
    assert len(users.json()["data"]) == 3
    assert all("email" not in row and "hourly_rate_pln" not in row for row in users.json()["data"])
    assert client.get("/locations", headers=headers).status_code == 200


def test_checkout_sells_starter_and_pro_in_dollars(client, db_session, monkeypatch):
    """Starter was refused by the request schema (only Pro/Business passed); every business pays USD."""
    import types

    from app.core.config import settings
    from app.routers import billing as billing_router

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(settings, "stripe_price_starter_usd_monthly", "price_starter_m")
    monkeypatch.setattr(settings, "stripe_price_pro_usd_annual", "price_pro_y")
    sessions: list[dict] = []

    def create(**kwargs):
        sessions.append(kwargs)
        return types.SimpleNamespace(id="cs_1", url="https://checkout.stripe.com/c/cs_1")

    fake = types.SimpleNamespace(checkout=types.SimpleNamespace(Session=types.SimpleNamespace(create=create)))
    monkeypatch.setattr(billing_router, "_get_stripe", lambda: fake)

    headers = _workspace(db_session, members=2, plan=SubscriptionPlanEnum.PRO, status=SubscriptionStatusEnum.TRIALING, trial_ends_at=datetime.now(UTC) + timedelta(days=20))
    # While the free trial runs, plans can't be bought (it changed nothing and cut the trial short).
    during = client.post("/billing/checkout-session", headers=headers, json={"plan": "standard", "billing_cycle": "monthly"})
    assert during.status_code == 409 and "trial" in during.json()["error"]["message"]
    db_session.query(OrganizationSubscription).update({"trial_ends_at": datetime.now(UTC) - timedelta(days=1)})
    db_session.commit()
    # An older Polish business still checks out in dollars.
    org = db_session.query(Organization).filter(Organization.name == "Billing pro 2").one()
    org.country = "PL"
    db_session.commit()

    starter = client.post("/billing/checkout-session", headers=headers, json={"plan": "standard", "billing_cycle": "monthly"})
    assert starter.status_code == 200, starter.text
    assert sessions[-1]["line_items"] == [{"price": "price_starter_m", "quantity": 1}]
    pro = client.post("/billing/checkout-session", headers=headers, json={"plan": "pro", "billing_cycle": "annual"})
    assert pro.status_code == 200 and sessions[-1]["line_items"][0]["price"] == "price_pro_y"
    assert client.post("/billing/checkout-session", headers=headers, json={"plan": "business"}).status_code == 422


def test_stripe_webhook_updates_the_plan_from_the_raw_event(client, db_session, monkeypatch):
    """Real events from stripe-python 15: SDK objects have no .get(); the webhook reads plain JSON."""
    import hashlib
    import hmac
    import json
    import time

    from app.core.config import settings

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")
    monkeypatch.setattr(settings, "stripe_price_starter_usd_monthly", "price_starter_m")
    _workspace(db_session, members=1, plan=SubscriptionPlanEnum.PRO, status=SubscriptionStatusEnum.TRIALING, trial_ends_at=datetime.now(UTC) + timedelta(days=20))
    org = db_session.query(Organization).filter(Organization.name == "Billing pro 1").one()

    def send(event: dict):
        body = json.dumps({"object": "event", "livemode": False, **event})
        stamp = int(time.time())
        signature = hmac.new(b"whsec_test", f"{stamp}.{body}".encode(), hashlib.sha256).hexdigest()
        return client.post("/billing/webhooks/stripe", content=body, headers={"stripe-signature": f"t={stamp},v1={signature}", "content-type": "application/json"})

    period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    completed = send({"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {"client_reference_id": str(org.id), "customer": "cus_1", "subscription": "sub_1", "metadata": {}}}})
    assert completed.status_code == 200, completed.text
    # Subscription objects from the 2025+ API: the period lives on the items.
    created = send({"id": "evt_2", "type": "customer.subscription.created", "data": {"object": {
        "id": "sub_1", "customer": "cus_1", "status": "active", "trial_end": None, "metadata": {"organization_id": str(org.id)},
        "items": {"data": [{"price": {"id": "price_starter_m"}, "current_period_end": period_end, "quantity": 1}]},
    }}})
    assert created.status_code == 200, created.text
    db_session.expire_all()
    stored = db_session.query(OrganizationSubscription).filter(OrganizationSubscription.organization_id == org.id).one()
    assert stored.plan == SubscriptionPlanEnum.STANDARD and stored.status == SubscriptionStatusEnum.ACTIVE
    assert stored.stripe_subscription_id == "sub_1" and stored.current_period_ends_at is not None and stored.trial_ends_at is None
    failed = send({"id": "evt_3", "type": "invoice.payment_failed", "data": {"object": {"parent": {"subscription_details": {"subscription": "sub_1"}}}}})
    assert failed.status_code == 200
    db_session.expire_all()
    assert db_session.query(OrganizationSubscription).filter(OrganizationSubscription.organization_id == org.id).one().status == SubscriptionStatusEnum.PAST_DUE
    assert send({"id": "evt_4", "type": "ping", "data": {"object": {}}}).status_code == 200
    bad = client.post("/billing/webhooks/stripe", content="{}", headers={"stripe-signature": "t=1,v1=bad"})
    assert bad.status_code == 400
