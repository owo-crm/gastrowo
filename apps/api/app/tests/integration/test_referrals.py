from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta

from app.models import Organization, OrganizationSubscription, SubscriptionStatusEnum
from app.tests.integration.test_api_flow import auth_header, sent_code


def _owner(client, *, name: str, email: str, ref: str | None = None) -> str:
    client.post("/auth/otp/send", json={"email": email, "purpose": "owner_signup"})
    verify = client.post("/auth/otp/verify", json={"email": email, "code": sent_code(email), "purpose": "owner_signup"})
    body = {
        "verification_token": verify.json()["data"]["verification_token"],
        "organization_name": name,
        "full_name": "Owner",
        "email": email,
        "password": "Password123!",
        "source": "Friend",
        **({"referral_code": ref} if ref else {}),
    }
    return client.post("/auth/onboarding/owner/complete", json=body).json()["data"]["access_token"]


def _send_webhook(client, event: dict):
    body = json.dumps({"object": "event", "livemode": False, **event})
    stamp = int(time.time())
    signature = hmac.new(b"whsec_test", f"{stamp}.{body}".encode(), hashlib.sha256).hexdigest()
    return client.post("/billing/webhooks/stripe", content=body, headers={"stripe-signature": f"t={stamp},v1={signature}", "content-type": "application/json"})


def test_referral_link_gives_the_new_business_a_longer_trial_and_the_inviter_a_free_month(client, db_session, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")
    monkeypatch.setattr(settings, "stripe_price_starter_usd_monthly", "price_starter_m")

    inviter = _owner(client, name="Inviter Diner", email="owner@inviter.com")
    summary = client.get("/organizations/current/referrals", headers=auth_header(inviter)).json()["data"]
    code = summary["code"]
    assert len(code) == 8 and summary["path"] == f"/?ref={code}" and summary["joined"] == 0

    # A wrong code is ignored; the right one links the businesses and adds 30 trial days.
    _owner(client, name="Nobody Cafe", email="owner@nobody.com", ref="WRONG123")
    _owner(client, name="Friend Bistro", email="owner@friend.com", ref=code.lower())
    friend = db_session.query(Organization).filter(Organization.name == "Friend Bistro").one()
    inviter_org = db_session.query(Organization).filter(Organization.name == "Inviter Diner").one()
    assert friend.referred_by_id == inviter_org.id
    assert db_session.query(Organization).filter(Organization.name == "Nobody Cafe").one().referred_by_id is None
    trial = db_session.query(OrganizationSubscription).filter(OrganizationSubscription.organization_id == friend.id).one().trial_ends_at
    assert (trial.replace(tzinfo=UTC) if trial.tzinfo is None else trial) > datetime.now(UTC) + timedelta(days=55)

    # The friend starts paying: the inviter (still on the trial) gets 30 more days, once.
    inviter_sub = db_session.query(OrganizationSubscription).filter(OrganizationSubscription.organization_id == inviter_org.id).one()
    before = inviter_sub.trial_ends_at
    event = {"id": "evt_1", "type": "customer.subscription.created", "data": {"object": {
        "id": "sub_friend", "customer": "cus_friend", "status": "active", "metadata": {"organization_id": str(friend.id)},
        "items": {"data": [{"price": {"id": "price_starter_m"}, "current_period_end": int(time.time()) + 30 * 86400}]},
    }}}
    assert _send_webhook(client, event).status_code == 200
    assert _send_webhook(client, {**event, "id": "evt_2", "type": "customer.subscription.updated"}).status_code == 200
    db_session.expire_all()
    after = db_session.query(OrganizationSubscription).filter(OrganizationSubscription.organization_id == inviter_org.id).one().trial_ends_at
    assert (after - before).days == 30
    summary = client.get("/organizations/current/referrals", headers=auth_header(inviter)).json()["data"]
    assert summary["joined"] == 1 and summary["paying"] == 1
    bell = client.get("/notifications", headers=auth_header(inviter)).json()["data"]
    assert bell["items"][0]["title"] == "You earned a free month"


def test_free_month_waits_as_a_credit_and_is_used_at_checkout(client, db_session, monkeypatch):
    import types

    from app.core.config import settings
    from app.routers import billing as billing_router
    from app.services import referrals

    inviter = _owner(client, name="Credit Diner", email="owner@credit.com")
    org = db_session.query(Organization).filter(Organization.name == "Credit Diner").one()
    sub = db_session.query(OrganizationSubscription).filter(OrganizationSubscription.organization_id == org.id).one()
    sub.status = SubscriptionStatusEnum.EXPIRED  # trial over, not paying: the reward becomes a credit
    db_session.commit()
    assert referrals.grant_free_month(db_session, org) == "credit"
    db_session.commit()
    assert org.referral_free_months == 1

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_x")
    monkeypatch.setattr(settings, "stripe_price_starter_usd_monthly", "price_starter_m")
    sessions: list[dict] = []
    fake = types.SimpleNamespace(
        checkout=types.SimpleNamespace(Session=types.SimpleNamespace(create=lambda **kw: sessions.append(kw) or types.SimpleNamespace(id="cs", url="https://x"))),
        Coupon=types.SimpleNamespace(retrieve=lambda _id: None, create=lambda **kw: None),
    )
    monkeypatch.setattr(billing_router, "_get_stripe", lambda: fake)
    assert client.post("/billing/checkout-session", headers=auth_header(inviter), json={"plan": "standard"}).status_code == 200
    assert sessions[-1]["discounts"] == [{"coupon": referrals.COUPON_ID}]
    assert sessions[-1]["subscription_data"]["metadata"]["referral_credit"] == "1"
