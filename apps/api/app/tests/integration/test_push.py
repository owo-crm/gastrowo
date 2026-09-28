from __future__ import annotations

from sqlalchemy import select

from app.models import PushSubscription
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.test_api_flow import auth_header, get_user_id, invite_accept_login, signup_ADMIN


class FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code


def test_notifications_are_pushed_and_dead_devices_are_dropped(client, db_session, monkeypatch):
    import pywebpush

    import app.services.push as push

    sent: list[dict] = []

    def fake_webpush(subscription_info, data, **kwargs):
        sent.append({"endpoint": subscription_info["endpoint"], "data": data, "claims": kwargs.get("vapid_claims")})
        if subscription_info["endpoint"].endswith("/dead"):
            raise pywebpush.WebPushException("gone", response=FakeResponse(410))

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    monkeypatch.setattr(push, "_session_factory", TestingSessionLocal)
    monkeypatch.setattr(push, "_submit", push._deliver)
    monkeypatch.setattr(push, "_keys_cache", None)

    admin, location_id = signup_ADMIN(client, organization_name="Push Diner", email="owner@push-diner.com")
    staff = invite_accept_login(client, ADMIN_token=admin, email="cook@push-diner.com", full_name="Cook", location_id=location_id)
    staff_id = get_user_id(client, token=admin, email="cook@push-diner.com")

    key = client.get("/push/key").json()["data"]["public_key"]
    assert len(key) > 60 and client.get("/push/key").json()["data"]["public_key"] == key  # stable

    keys = {"p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "auth": "tBHItJI5svbpez7KI4CCXg"}
    for endpoint in ("https://push.example.com/live", "https://push.example.com/dead"):
        assert client.post("/push/subscribe", headers=auth_header(staff), json={"endpoint": endpoint, "keys": keys}).status_code == 200

    client.post("/tasks", headers=auth_header(admin), json={"title": "Restock napkins", "description": "", "assigned_to": staff_id})

    assert {item["endpoint"] for item in sent} == {"https://push.example.com/live", "https://push.example.com/dead"}
    assert '"title": "New task"' in sent[0]["data"] and '"url": "/tasks"' in sent[0]["data"]
    assert sent[0]["claims"]["sub"].startswith("mailto:")
    remaining = TestingSessionLocal().scalars(select(PushSubscription.endpoint)).all()
    assert remaining == ["https://push.example.com/live"]
