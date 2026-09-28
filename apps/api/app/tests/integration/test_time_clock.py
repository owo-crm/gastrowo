from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.models import Assignment, ClockSession, Location, RoleEnum, Shift, Timesheet, TimesheetStatusEnum
from app.tests.integration.test_api_flow import auth_header, get_user_id, invite_accept_login, signup_ADMIN


def _team(client):
    admin, location_id = signup_ADMIN(client, organization_name="Clock Diner", email="owner@clock-diner.com")
    staff = invite_accept_login(client, ADMIN_token=admin, email="cook@clock-diner.com", full_name="Casey Cook", location_id=location_id)
    return admin, staff, location_id, get_user_id(client, token=admin, email="cook@clock-diner.com")


def _shift_now(db, location_id, user_id, *, started_hours_ago: float, length_hours: float = 8):
    location = db.get(Location, UUID(location_id))
    zone = ZoneInfo(location.timezone)
    start = (datetime.now(zone) - timedelta(hours=started_hours_ago)).replace(second=0, microsecond=0)
    end = start + timedelta(hours=length_hours)
    shift = Shift(organization_id=location.organization_id, location_id=location.id, date=start.date(), start_time=start.time(), end_time=end.time(), required_role=RoleEnum.STAFF, staff_position="Line cook", required_count=1)
    db.add(shift)
    db.flush()
    db.add(Assignment(shift_id=shift.id, user_id=UUID(user_id)))
    db.commit()
    return shift, start


def test_phone_clock_on_schedule_is_approved_and_off_schedule_waits(client, db_session):
    admin, staff, location_id, staff_id = _team(client)
    shift, start = _shift_now(db_session, location_id, staff_id, started_hours_ago=0.05)

    assert client.get("/clock/me", headers=auth_header(staff)).json()["data"]["open_session"] is None
    clocked = client.post("/clock/in", headers=auth_header(staff))
    assert clocked.status_code == 200, clocked.text
    assert clocked.json()["data"]["shift"]["id"] == str(shift.id)
    assert client.post("/clock/in", headers=auth_header(staff)).status_code == 409

    # Fast-forward: the shift started 8 hours ago and ends now, and the clock-in was on time.
    earlier = start - timedelta(hours=8) + timedelta(minutes=3)
    shift = db_session.get(Shift, shift.id)
    shift.date, shift.start_time, shift.end_time = earlier.date(), earlier.time(), (earlier + timedelta(hours=8)).time()
    session = db_session.scalar(select(ClockSession).where(ClockSession.user_id == UUID(staff_id)))
    session.clock_in_at = earlier.astimezone(UTC)
    db_session.commit()
    out = client.post("/clock/out", headers=auth_header(staff))
    assert out.status_code == 200, out.text
    assert out.json()["data"]["timesheet_status"] == "approved"

    # No shift at all: the entry waits for the manager, who gets a notice.
    assert client.post("/clock/in", headers=auth_header(staff)).json()["data"]["shift"] is None
    assert client.post("/clock/out", headers=auth_header(staff)).json()["data"]["timesheet_status"] == "pending"
    entries = db_session.scalars(select(Timesheet).where(Timesheet.user_id == UUID(staff_id))).all()
    assert sorted(item.status.value for item in entries) == ["approved", "pending"]
    notices = client.get("/notifications", headers=auth_header(admin)).json()["data"]["items"]
    assert any(item["title"] == "Hours to approve" for item in notices)


def test_tablet_clock_with_pin_and_the_mode_setting(client, db_session):
    admin, staff, location_id, staff_id = _team(client)
    kiosk = client.post("/clock/kiosks", headers=auth_header(admin), json={"location_id": location_id, "name": "Front tablet"}).json()["data"]
    device = {"X-Kiosk-Token": kiosk["token"]}
    assert client.get("/kiosk/device", headers=device).json()["data"]["location_name"]
    assert client.get("/kiosk/device", headers={"X-Kiosk-Token": "nope"}).status_code == 401
    # Staff can't set up tablets.
    assert client.post("/clock/kiosks", headers=auth_header(staff), json={"location_id": location_id}).status_code == 403

    pin = client.post(f"/clock/pins/{staff_id}", headers=auth_header(admin)).json()["data"]["pin"]
    assert len(pin) == 4 and pin.isdigit()
    assert client.post("/kiosk/punch", headers=device, json={"pin": "0000" if pin != "0000" else "1111"}).status_code == 404
    first = client.post("/kiosk/punch", headers=device, json={"pin": pin}).json()["data"]
    assert first["action"] == "in" and first["full_name"]
    second = client.post("/kiosk/punch", headers=device, json={"pin": pin}).json()["data"]
    assert second["action"] == "out"

    # The worker can pick their own PIN, but not one a colleague already has.
    assert client.put("/clock/pin", headers=auth_header(staff), json={"pin": "4821"}).status_code == 200
    assert client.put("/clock/pin", headers=auth_header(admin), json={"pin": "4821"}).status_code == 409

    # Tablet only: the phone button is refused. Phone only: the tablet is refused.
    assert client.patch("/clock/settings", headers=auth_header(admin), json={"mode": "kiosk"}).status_code == 200
    assert client.post("/clock/in", headers=auth_header(staff)).status_code == 403
    assert client.patch("/clock/settings", headers=auth_header(admin), json={"mode": "phone"}).status_code == 200
    assert client.post("/kiosk/punch", headers=device, json={"pin": "4821"}).status_code == 403
    assert client.get("/auth/me", headers=auth_header(admin)).json()["data"]["organization_settings"]["clock_mode"] == "phone"

    # Removing the tablet kills its token.
    assert client.delete(f"/clock/kiosks/{kiosk['id']}", headers=auth_header(admin)).status_code == 200
    assert client.get("/kiosk/device", headers=device).status_code == 401


def test_wrong_pins_are_rate_limited(client):
    admin, _staff, location_id, _ = _team(client)
    device = {"X-Kiosk-Token": client.post("/clock/kiosks", headers=auth_header(admin), json={"location_id": location_id}).json()["data"]["token"]}
    codes = [client.post("/kiosk/punch", headers=device, json={"pin": f"99{index:02d}"}).status_code for index in range(10)]
    assert codes[:8] == [404] * 8 and codes[8:] == [429, 429]


def test_breaks_are_subtracted_from_hours_and_pay(client, db_session):
    admin, staff, location_id, staff_id = _team(client)
    client.patch(f"/locations/{location_id}/members/{staff_id}", headers=auth_header(admin), json={"hourly_rate_pln": "20.00", "priority": 3})
    assert client.post("/clock/in", headers=auth_header(staff)).status_code == 200
    assert client.post("/clock/break/start", headers=auth_header(staff)).json()["data"]["on_break"] is True
    assert client.post("/clock/break/start", headers=auth_header(staff)).status_code == 409

    # Fast-forward: clocked in 8 h ago, the break has lasted 30 min when the shift ends.
    session = db_session.scalar(select(ClockSession).where(ClockSession.user_id == UUID(staff_id)))
    session.clock_in_at = datetime.now(UTC) - timedelta(hours=8)
    session.break_started_at = datetime.now(UTC) - timedelta(minutes=30)
    db_session.commit()
    out = client.post("/clock/out", headers=auth_header(staff))
    assert out.status_code == 200, out.text

    entry = db_session.scalar(select(Timesheet).where(Timesheet.user_id == UUID(staff_id)))
    assert entry.break_minutes == 30
    client.patch(f"/timesheets/{entry.id}", headers=auth_header(admin), json={"action": "approve"})
    today = datetime.now(UTC).date()
    summary = client.get(f"/payroll/summary?start_date={(today - timedelta(days=2)).isoformat()}&end_date={(today + timedelta(days=1)).isoformat()}", headers=auth_header(admin)).json()["data"]
    row = next(item for item in summary["rows"] if item["user_id"] == staff_id)
    assert abs(float(row["approved_hours"]) - 7.5) < 0.05


def test_phone_clock_in_only_near_the_location(client, db_session):
    admin, staff, location_id, _ = _team(client)
    # The restaurant is in Brooklyn; the worker tries from Manhattan, then from the door.
    assert client.put(f"/locations/{location_id}/clock-area", headers=auth_header(admin), json={"latitude": 40.6782, "longitude": -73.9442, "radius_m": 150}).status_code == 200
    assert client.get("/clock/me", headers=auth_header(staff)).json()["data"]["needs_location"] is True
    assert client.post("/clock/in", headers=auth_header(staff)).status_code == 428
    far = client.post("/clock/in", headers=auth_header(staff), json={"latitude": 40.7580, "longitude": -73.9855, "accuracy": 20})
    assert far.status_code == 403 and " m from " in far.json()["error"]["message"]
    near = client.post("/clock/in", headers=auth_header(staff), json={"latitude": 40.6786, "longitude": -73.9440, "accuracy": 15})
    assert near.status_code == 200, near.text
    # Turning the check off removes the requirement.
    client.post("/clock/out", headers=auth_header(staff))
    assert client.put(f"/locations/{location_id}/clock-area", headers=auth_header(admin), json={"latitude": None, "longitude": None}).status_code == 200
    assert client.post("/clock/in", headers=auth_header(staff)).status_code == 200


def test_tablet_break_button(client):
    admin, _staff, location_id, staff_id = _team(client)
    device = {"X-Kiosk-Token": client.post("/clock/kiosks", headers=auth_header(admin), json={"location_id": location_id}).json()["data"]["token"]}
    pin = client.post(f"/clock/pins/{staff_id}", headers=auth_header(admin)).json()["data"]["pin"]
    assert client.post("/kiosk/punch", headers=device, json={"pin": pin, "action": "break"}).status_code == 409
    assert client.post("/kiosk/punch", headers=device, json={"pin": pin}).json()["data"]["action"] == "in"
    assert client.post("/kiosk/punch", headers=device, json={"pin": pin, "action": "break"}).json()["data"]["action"] == "break_start"
    assert client.post("/kiosk/punch", headers=device, json={"pin": pin, "action": "break"}).json()["data"]["action"] == "break_end"
    assert client.post("/kiosk/punch", headers=device, json={"pin": pin}).json()["data"]["action"] == "out"
