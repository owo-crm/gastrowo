from __future__ import annotations

from app.tests.integration.test_api_flow import auth_header, signup_ADMIN


def _setup(client, monkeypatch):
    from app.core.config import settings

    boss, _ = signup_ADMIN(client, organization_name="Platofy HQ", email="me@plato-hq.com")
    monkeypatch.setattr(settings, "platform_admin_emails", "me@plato-hq.com")
    customer, _ = signup_ADMIN(client, organization_name="Taco Stand", email="owner@taco-stand.com")
    return boss, customer


def _bell(client, token):
    return client.get("/notifications", headers=auth_header(token)).json()["data"]


def test_customer_writes_team_replies_both_are_notified(client, monkeypatch):
    boss, customer = _setup(client, monkeypatch)
    assert client.get("/support", headers=auth_header(customer)).json()["data"] == {"thread": None, "messages": [], "unread": 0}

    sent = client.post("/support/messages", headers=auth_header(customer), json={"body": "  How do I add a second location?  "})
    assert sent.status_code == 200
    assert [m["body"] for m in sent.json()["data"]["messages"]] == ["How do I add a second location?"]

    # The team gets a bell notification (which also pushes) that opens the conversation.
    bell = _bell(client, boss)
    assert bell["unread_count"] == 1 and bell["items"][0]["action_url"].startswith("/platform/support?thread=")
    assert client.get("/platform/support/unread", headers=auth_header(boss)).json()["data"]["threads"] == 1

    threads = client.get("/platform/support/threads", headers=auth_header(boss)).json()["data"]
    assert len(threads) == 1 and threads[0]["organization_name"] == "Taco Stand" and threads[0]["unread"] == 1
    thread_id = threads[0]["id"]

    opened = client.get(f"/platform/support/threads/{thread_id}", headers=auth_header(boss)).json()["data"]
    assert opened["unread"] == 0 and len(opened["messages"]) == 1
    assert client.get("/platform/support/unread", headers=auth_header(boss)).json()["data"]["threads"] == 0

    replied = client.post(f"/platform/support/threads/{thread_id}/messages", headers=auth_header(boss), json={"body": "Team → Locations → Add."})
    assert replied.status_code == 200 and replied.json()["data"]["messages"][-1]["from_staff"] is True

    # The customer is told and sees one unread reply signed by the team, not by a person.
    assert client.get("/support/unread", headers=auth_header(customer)).json()["data"]["unread"] == 1
    bell = _bell(client, customer)
    assert bell["items"][0]["title"] == "Reply from the Platofy team" and bell["items"][0]["action_url"] == "/settings?support=1"
    mine = client.get("/support?read=true", headers=auth_header(customer)).json()["data"]
    assert mine["messages"][-1]["author_name"] == "Platofy team"
    assert client.get("/support/unread", headers=auth_header(customer)).json()["data"]["unread"] == 0

    # Closing hides it from the open list; a new customer message reopens it.
    client.patch(f"/platform/support/threads/{thread_id}", headers=auth_header(boss), json={"status": "closed"})
    assert client.get("/platform/support/threads", headers=auth_header(boss)).json()["data"] == []
    client.post("/support/messages", headers=auth_header(customer), json={"body": "One more thing"})
    assert client.get("/platform/support/threads", headers=auth_header(boss)).json()["data"][0]["status"] == "open"


def test_only_the_team_reads_the_inbox_and_empty_messages_are_refused(client, monkeypatch):
    boss, customer = _setup(client, monkeypatch)
    assert client.post("/support/messages", headers=auth_header(customer), json={"body": "   "}).status_code == 422
    client.post("/support/messages", headers=auth_header(customer), json={"body": "Hi"})
    assert client.get("/platform/support/threads", headers=auth_header(customer)).status_code == 403
    thread_id = client.get("/platform/support/threads", headers=auth_header(boss)).json()["data"][0]["id"]
    assert client.post(f"/platform/support/threads/{thread_id}/messages", headers=auth_header(customer), json={"body": "x"}).status_code == 403
    # Another business never sees this conversation.
    other, _ = signup_ADMIN(client, organization_name="Pho Place", email="owner@pho.com")
    assert client.get("/support", headers=auth_header(other)).json()["data"]["thread"] is None
