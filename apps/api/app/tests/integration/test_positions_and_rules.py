from __future__ import annotations

from datetime import timedelta

from app.tests.integration.test_api_flow import (
    auth_header,
    current_monday,
    get_user_id,
    invite_accept_login,
    signup_ADMIN,
    submit_staff_availability,
)


def _template(client, token, location_id, *, day, position, count=1, start="08:00:00", end="16:00:00"):
    response = client.post(
        "/schedule/templates",
        headers=auth_header(token),
        json={
            "location_id": location_id,
            "day_of_week": day,
            "template_name": f"{position} {day}",
            "start_time": start,
            "end_time": end,
            "required_role": "STAFF",
            "staff_position": position,
            "required_count": count,
        },
    )
    assert response.status_code == 200, response.text


def _approve(client, token, timesheet_id):
    response = client.patch(f"/timesheets/{timesheet_id}", headers=auth_header(token), json={"action": "approve"})
    assert response.status_code == 200, response.text


def test_second_position_is_scheduled_and_paid_at_its_own_rate(client):
    admin, location_id = signup_ADMIN(client, organization_name="Diner Positions", email="owner@diner-positions.com")
    multi_token = invite_accept_login(client, ADMIN_token=admin, email="sam@diner-positions.com", full_name="Sam", location_id=location_id)
    cook_token = invite_accept_login(client, ADMIN_token=admin, email="cook@diner-positions.com", full_name="Cook", location_id=location_id)
    multi_id = get_user_id(client, token=admin, email="sam@diner-positions.com")
    cook_id = get_user_id(client, token=admin, email="cook@diner-positions.com")
    for user_id in (multi_id, cook_id):
        client.patch(f"/locations/{location_id}/members/{user_id}", headers=auth_header(admin), json={"hourly_rate_pln": "20.00", "priority": 3})

    # Sam is a server first, and also tends bar at a higher rate.
    put = client.put(
        f"/workers/{multi_id}/positions",
        headers=auth_header(admin),
        json={"positions": [{"position": "Server", "is_primary": True}, {"position": "Bartender", "hourly_rate": "30.00"}]},
    )
    assert put.status_code == 200, put.text
    assert [item["position"] for item in put.json()["data"]] == ["Server", "Bartender"]
    assert client.patch(f"/users/{cook_id}/position", headers=auth_header(admin), json={"staff_position": "Line cook"}).status_code == 200

    setup = client.get(f"/workers/{multi_id}/setup", headers=auth_header(admin)).json()["data"]
    assert setup["staff_position"] == "Server"
    assert {item["position"]: item["is_primary"] for item in setup["positions"]} == {"Server": True, "Bartender": False}
    positions = {item["name"] for item in client.get("/positions", headers=auth_header(admin)).json()["data"]}
    assert {"Server", "Bartender", "Line cook"} <= positions

    monday = current_monday()
    for token in (multi_token, cook_token):
        assert submit_staff_availability(client, staff_token=token, week_start=monday, desired_hours=40).status_code == 200
    _template(client, admin, location_id, day=0, position="Bartender", count=2)

    applied = client.post("/schedule/generate/apply", headers=auth_header(admin), json={"week_start": monday.isoformat()})
    assert applied.status_code == 200, applied.text
    shifts = client.get("/schedule/shifts", headers=auth_header(admin), params={"week_start": monday.isoformat()}).json()["data"]
    assert len(shifts) == 1
    # Only Sam can tend bar; the cook stays off the bartender shift.
    assert [item["user_id"] for item in shifts[0]["assignments"]] == [multi_id]

    submit = client.post(
        "/timesheets",
        headers=auth_header(multi_token),
        json={"shift_id": shifts[0]["id"], "arrived_at": "08:00:00", "left_at": "16:00:00"},
    )
    assert submit.status_code == 200, submit.text
    _approve(client, admin, submit.json()["data"]["id"])

    period = {"start_date": monday.isoformat(), "end_date": (monday + timedelta(days=6)).isoformat()}
    payroll = client.get("/payroll/summary", headers=auth_header(admin), params=period).json()["data"]
    sam = next(row for row in payroll["rows"] if row["user_id"] == multi_id)
    assert sam["approved_hours"] == "8.00"
    assert sam["payroll_pln"] == "240.00"  # 8 h at the bartender rate, not the 20.00 location rate
    assert payroll["currency"] == "USD"


def test_us_auto_plan_avoids_overtime_and_payroll_adds_the_premium(client):
    admin, location_id = signup_ADMIN(client, organization_name="Diner Overtime", email="owner@diner-overtime.com")
    staff_token = invite_accept_login(client, ADMIN_token=admin, email="alex@diner-overtime.com", full_name="Alex", location_id=location_id)
    staff_id = get_user_id(client, token=admin, email="alex@diner-overtime.com")
    client.patch(f"/locations/{location_id}/members/{staff_id}", headers=auth_header(admin), json={"hourly_rate_pln": "20.00", "priority": 3})
    assert client.patch(f"/users/{staff_id}/position", headers=auth_header(admin), json={"staff_position": "Server"}).status_code == 200

    monday = current_monday()
    assert submit_staff_availability(client, staff_token=staff_token, week_start=monday, desired_hours=60, start_time="07:00:00", end_time="23:00:00").status_code == 200
    for day in range(5):
        _template(client, admin, location_id, day=day, position="Server", start="08:00:00", end="17:00:00")  # 9 h each

    preview = client.post("/schedule/generate/preview", headers=auth_header(admin), json={"week_start": monday.isoformat()})
    assert preview.status_code == 200, preview.text
    data = preview.json()["data"]
    # 4 x 9 h = 36 h; a fifth shift would take Alex past 40 h.
    assert len(data["assignments"]) == 4
    assert any("weekly_overtime" in item["reasons"] for item in data["rejected_candidates"])

    applied = client.post("/schedule/generate/apply", headers=auth_header(admin), json={"week_start": monday.isoformat()})
    assert applied.status_code == 200
    shifts = client.get("/schedule/shifts", headers=auth_header(admin), params={"week_start": monday.isoformat()}).json()["data"]
    for shift in shifts:
        if not shift["assignments"]:
            continue
        created = client.post(
            "/timesheets",
            headers=auth_header(staff_token),
            json={"shift_id": shift["id"], "arrived_at": "08:00:00", "left_at": "17:00:00"},
        )
        assert created.status_code == 200, created.text
        _approve(client, admin, created.json()["data"]["id"])
    # Alex covers the open Friday shift anyway: 8 more hours, 44 h in the week.
    extra = client.post(
        "/timesheets",
        headers=auth_header(staff_token),
        json={"work_date": (monday + timedelta(days=4)).isoformat(), "arrived_at": "08:00:00", "left_at": "16:00:00"},
    )
    assert extra.status_code == 200, extra.text
    _approve(client, admin, extra.json()["data"]["id"])

    period = {"start_date": monday.isoformat(), "end_date": (monday + timedelta(days=6)).isoformat()}
    row = next(item for item in client.get("/payroll/summary", headers=auth_header(admin), params=period).json()["data"]["rows"] if item["user_id"] == staff_id)
    assert row["approved_hours"] == "44.00"
    assert row["overtime_hours"] == "4.00"
    assert row["overtime_premium"] == "40.00"  # 4 h x 20.00 x 0.5
    assert row["payroll_pln"] == "920.00"  # 44 h x 20.00 + 40.00

    csv_lines = client.get("/payroll/export.csv", headers=auth_header(admin), params=period).content.decode("utf-8-sig").splitlines()
    assert csv_lines[0].endswith("Overtime hours,Overtime premium USD")


def test_polish_business_keeps_labour_code_and_skips_overtime_rule(client):
    admin, _location_id = signup_ADMIN(client, organization_name="Bistro Rules", email="owner@bistro-rules.pl")
    patched = client.patch("/organizations/current", headers=auth_header(admin), json={"country": "PL"})
    assert patched.status_code == 200
    me = client.get("/auth/me", headers=auth_header(admin)).json()["data"]
    assert me["organization_settings"]["country"] == "PL"
    assert me["organization_settings"]["currency"] == "PLN"
    assert me["organization_settings"]["labor_rules"] == "PL"
    locations = client.get("/locations", headers=auth_header(admin)).json()["data"]
    assert locations[0]["timezone"] == "Europe/Warsaw"


def test_polish_payroll_counts_overtime_hours_and_flags_low_rates(client):
    admin, location_id = signup_ADMIN(client, organization_name="Bistro Nadgodziny", email="owner@bistro-ng.pl")
    assert client.patch("/organizations/current", headers=auth_header(admin), json={"country": "PL"}).status_code == 200
    staff_token = invite_accept_login(client, ADMIN_token=admin, email="ola@bistro-ng.pl", full_name="Ola", location_id=location_id)
    staff_id = get_user_id(client, token=admin, email="ola@bistro-ng.pl")
    client.patch(f"/locations/{location_id}/members/{staff_id}", headers=auth_header(admin), json={"hourly_rate_pln": "25.00", "priority": 3})

    monday = current_monday()
    # Monday 11 h, Tuesday-Friday 9 h each: 3 + 4 x 1 = 7 h over the 8-hour daily norm, 47 h in the week.
    for day, left in [(0, "19:00:00"), (1, "17:00:00"), (2, "17:00:00"), (3, "17:00:00"), (4, "17:00:00")]:
        created = client.post(
            "/timesheets",
            headers=auth_header(staff_token),
            json={"work_date": (monday + timedelta(days=day)).isoformat(), "arrived_at": "08:00:00", "left_at": left},
        )
        assert created.status_code == 200, created.text
        _approve(client, admin, created.json()["data"]["id"])

    period = {"start_date": monday.isoformat(), "end_date": (monday + timedelta(days=6)).isoformat()}
    data = client.get("/payroll/summary", headers=auth_header(admin), params=period).json()["data"]
    row = next(item for item in data["rows"] if item["user_id"] == staff_id)
    assert data["currency"] == "PLN"
    assert row["approved_hours"] == "47.00"
    assert row["overtime_hours"] == "7.00"
    assert "overtime_premium" not in row  # 50% or 100% depends on when it was worked: payroll leaves it to the accountant
    assert row["payroll_pln"] == "1175.00"  # 47 h x 25.00, no premium added
    assert row["below_minimum_rate"] in ("30.50", "31.40")

    csv_lines = client.get("/payroll/export.csv", headers=auth_header(admin), params=period).content.decode("utf-8-sig").splitlines()
    assert csv_lines[0].endswith(";Nadgodziny (8 h/dobę, 40 h/tydz.)")
    assert any(line.startswith("Ola;") and line.endswith(";7,00") for line in csv_lines)


def test_checkout_currency_follows_country_once_pln_prices_exist(monkeypatch):
    from app.core.config import settings
    from app.services.billing import checkout_currency_for
    from app.services.labor_rules import pl_overtime_hours

    assert checkout_currency_for("PL") == "USD"  # no PLN prices configured: charge dollars
    for name in ("starter_pln_monthly", "starter_pln_annual", "pro_pln_monthly", "pro_pln_annual", "pro_extra_location_pln_monthly", "pro_extra_location_pln_annual"):
        monkeypatch.setattr(settings, f"stripe_price_{name}", f"price_{name}")
    assert checkout_currency_for("PL") == "PLN"
    assert checkout_currency_for("US") == "USD"

    from datetime import date

    # Five 8-hour days are the norm; a sixth one is all weekly overtime.
    week = {date(2026, 10, 5) + timedelta(days=day): 8.0 for day in range(6)}
    assert pl_overtime_hours(week) == 8.0
