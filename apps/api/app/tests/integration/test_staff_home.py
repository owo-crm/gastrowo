from __future__ import annotations

from datetime import date, time
from uuid import UUID

from sqlalchemy import select

from app.models import Location, Timesheet, TimesheetStatusEnum
from app.tests.integration.test_api_flow import auth_header
from app.tests.integration.test_time_clock import _shift_now, _team


def test_home_shows_the_running_or_next_shift(client, db_session):
    _admin, staff, location_id, staff_id = _team(client)
    assert client.get("/clock/me", headers=auth_header(staff)).json()["data"]["next_shift"] is None

    # A shift that started an hour ago is still "next" until it ends; one that already ended is not.
    _shift_now(db_session, location_id, staff_id, started_hours_ago=10, length_hours=8)
    running, _start = _shift_now(db_session, location_id, staff_id, started_hours_ago=1, length_hours=8)
    _shift_now(db_session, location_id, staff_id, started_hours_ago=-30, length_hours=6)
    card = client.get("/clock/me", headers=auth_header(staff)).json()["data"]["next_shift"]
    assert card["shift_id"] == str(running.id)
    assert card["location_name"] and card["staff_position"] == "Line cook"
    assert len(card["start_time"]) == 5  # "HH:MM"


def test_manager_can_fix_hours_that_were_already_approved(client, db_session):
    admin, staff, location_id, staff_id = _team(client)
    location = db_session.get(Location, UUID(location_id))
    entry = Timesheet(
        organization_id=location.organization_id,
        user_id=UUID(staff_id),
        work_date=date(2026, 9, 21),
        arrived_at=time(10),
        left_at=time(18),
        status=TimesheetStatusEnum.APPROVED,
    )
    db_session.add(entry)
    db_session.commit()

    fixed = client.patch(
        f"/timesheets/{entry.id}",
        headers=auth_header(admin),
        json={"action": "correct", "arrived_at": "10:00:00", "left_at": "17:30:00", "review_note": "Forgot to clock out"},
    )
    assert fixed.status_code == 200, fixed.text
    assert fixed.json()["data"]["status"] == "corrected" and fixed.json()["data"]["left_at"].startswith("17:30")

    # The manager sees one person's whole history; the worker hears about the change.
    history = client.get("/timesheets", headers=auth_header(admin), params={"scope": "team", "user_id": staff_id}).json()["data"]
    assert [item["id"] for item in history] == [str(entry.id)]
    notices = client.get("/notifications", headers=auth_header(staff)).json()["data"]["items"]
    assert any(item["title"] == "Hours corrected" for item in notices)
    # Staff still can't touch anyone's hours.
    assert client.patch(f"/timesheets/{entry.id}", headers=auth_header(staff), json={"action": "approve"}).status_code == 403
    assert db_session.scalar(select(Timesheet.status).where(Timesheet.id == entry.id)) == TimesheetStatusEnum.CORRECTED
