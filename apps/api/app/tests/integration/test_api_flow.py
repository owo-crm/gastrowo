from __future__ import annotations

from datetime import date, timedelta


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def current_monday() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())


def signup_ADMIN(client, *, organization_name: str, email: str) -> tuple[str, str]:
    send = client.post("/auth/otp/send", json={"email": email, "purpose": "owner_signup"})
    assert send.status_code == 200
    code = send.json()["data"]["debug_code"]

    verify = client.post("/auth/otp/verify", json={"email": email, "code": code, "purpose": "owner_signup"})
    assert verify.status_code == 200
    verification_token = verify.json()["data"]["verification_token"]

    complete = client.post(
        "/auth/onboarding/owner/complete",
        json={
            "verification_token": verification_token,
            "organization_name": organization_name,
            "full_name": "ADMIN One",
            "email": email,
            "password": "ADMIN123!",
            "source": "Google",
        },
    )
    assert complete.status_code == 200
    ADMIN_token = complete.json()["data"]["access_token"]
    location_id = client.get("/locations", headers=auth_header(ADMIN_token)).json()["data"][0]["id"]
    return ADMIN_token, location_id


def signup_staff(client, *, full_name: str, email: str) -> str:
    send = client.post("/auth/otp/send", json={"email": email, "purpose": "worker_signup"})
    assert send.status_code == 200
    code = send.json()["data"]["debug_code"]
    signup = client.post(
        "/auth/otp/verify",
        json={
            "full_name": full_name,
            "email": email,
            "code": code,
            "purpose": "worker_signup",
        },
    )
    assert signup.status_code == 200
    payload = signup.json()["data"]
    return payload["access_token"]


def invite_accept_login(client, *, ADMIN_token: str, email: str, full_name: str, location_id: str) -> str:
    invite = client.post(
        "/organizations/members/link-by-email",
        headers=auth_header(ADMIN_token),
        json={"email": email},
    )
    assert invite.status_code == 200
    debug_link = invite.json()["data"]["debug_join_link"]
    invite_token = debug_link.split("token=")[1].split("&")[0]

    send = client.post("/auth/otp/send", json={"email": email, "purpose": "invite_join", "invite_token": invite_token})
    assert send.status_code == 200
    code = send.json()["data"]["debug_code"]

    accept = client.post(
        "/auth/invites/join/verify",
        json={"email": email, "code": code, "invite_token": invite_token},
    )
    assert accept.status_code == 200
    return accept.json()["data"]["access_token"]


def get_user_id(client, *, token: str, email: str) -> str:
    users = client.get("/users", headers=auth_header(token)).json()["data"]
    return next(item["id"] for item in users if item["email"] == email)


def submit_staff_availability(client, *, staff_token: str, week_start: date, desired_hours: int, start_time: str = "07:00:00", end_time: str = "22:00:00"):
    return client.put(
        f"/availability/weeks/{week_start.isoformat()}",
        headers=auth_header(staff_token),
        json={
            "week_start": week_start.isoformat(),
            "desired_hours": desired_hours,
            "slots": [
                {
                    "day_of_week": day,
                    "start_time": start_time,
                    "end_time": end_time,
                    "is_available": True,
                }
                for day in range(7)
            ],
        },
    )


def create_template(client, *, ADMIN_token: str, location_id: str, day_of_week: int = 0, required_count: int = 1):
    response = client.post(
        "/schedule/templates",
        headers=auth_header(ADMIN_token),
        json={
            "location_id": location_id,
            "day_of_week": day_of_week,
            "template_name": f"Template {day_of_week}",
            "start_time": "08:00:00",
            "end_time": "16:00:00",
            "required_role": "STAFF",
            "staff_position": "Staff",
            "required_count": required_count,
        },
    )
    assert response.status_code == 200


def test_full_api_flow_with_preview_apply_and_dashboard_labor(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Flow Org", email="ADMIN@flow.com")
    staff_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff@flow.com",
        full_name="Staff One",
        location_id=location_id,
    )
    staff_user_id = get_user_id(client, token=ADMIN_token, email="staff@flow.com")

    patch_member = client.patch(
        f"/locations/{location_id}/members/{staff_user_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "30.00", "priority": 5, "max_hours_per_week": 40},
    )
    assert patch_member.status_code == 200

    monday = current_monday()
    availability = submit_staff_availability(client, staff_token=staff_token, week_start=monday, desired_hours=32)
    assert availability.status_code == 200

    create_template(client, ADMIN_token=ADMIN_token, location_id=location_id)

    preview = client.post(
        "/schedule/generate/preview",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat()},
    )
    assert preview.status_code == 200
    preview_data = preview.json()["data"]
    assert preview_data["created_shifts"] == 1
    assert preview_data["created_assignments"] == 1
    assert preview_data["labor_cost_summary"]["total_pln"] == "240.00"

    apply = client.post(
        "/schedule/generate/apply",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat()},
    )
    assert apply.status_code == 200
    assert apply.json()["data"]["created_assignments"] == 1

    locked_update = submit_staff_availability(client, staff_token=staff_token, week_start=monday, desired_hours=24)
    assert locked_update.status_code == 422

    shifts = client.get(
        "/schedule/shifts",
        headers=auth_header(ADMIN_token),
        params={"week_start": monday.isoformat()},
    ).json()["data"]
    shift_id = shifts[0]["id"]

    start_shift = client.post(f"/shifts/{shift_id}/start", headers=auth_header(staff_token))
    assert start_shift.status_code == 200
    assert start_shift.json()["data"]["status"] == "in_shift"

    end_shift = client.post(f"/shifts/{shift_id}/end", headers=auth_header(staff_token))
    assert end_shift.status_code == 200
    assert end_shift.json()["data"]["status"] == "completed"

    create_task = client.post(
        "/tasks",
        headers=auth_header(ADMIN_token),
        json={
            "location_id": location_id,
            "title": "Clean coffee machine",
            "description": "End-of-day clean",
            "assigned_to": staff_user_id,
        },
    )
    assert create_task.status_code == 200
    task_id = create_task.json()["data"]["id"]

    add_photo = client.post(
        f"/tasks/{task_id}/photos",
        headers=auth_header(staff_token),
        json={"photo_url": "https://example.com/photo.jpg"},
    )
    assert add_photo.status_code == 200

    done_task = client.patch(
        f"/tasks/{task_id}",
        headers=auth_header(staff_token),
        json={"status": "done"},
    )
    assert done_task.status_code == 200
    assert done_task.json()["data"]["status"] == "done"

    add_report = client.post(
        "/reports/revenue",
        headers=auth_header(ADMIN_token),
        json={
            "location_id": location_id,
            "report_date": monday.isoformat(),
            "revenue": "1250.50",
            "currency": "PLN",
            "photo_url": "https://example.com/report.jpg",
        },
    )
    assert add_report.status_code == 200

    dashboard = client.get(
        "/dashboard/ADMIN",
        headers=auth_header(ADMIN_token),
        params={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    assert dashboard.status_code == 200
    dashboard_data = dashboard.json()["data"]
    assert dashboard_data["totals_by_day"][0]["revenue"] == "1250.50"
    assert dashboard_data["labor_cost_by_day"][0]["labor_cost_pln"] == "240.00"
    assert dashboard_data["revenue_vs_labor"][0]["revenue"] == "1250.50"


def test_workers_setup_patch_and_missing_availability_excludes_employee(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Setup Org", email="ADMIN@setup.com")
    invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff@setup.com",
        full_name="Staff Setup",
        location_id=location_id,
    )
    staff_user_id = get_user_id(client, token=ADMIN_token, email="staff@setup.com")

    patch_member = client.patch(
        f"/locations/{location_id}/members/{staff_user_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "45.50", "priority": 4, "max_hours_per_week": 30},
    )
    assert patch_member.status_code == 200
    assert patch_member.json()["data"]["hourly_rate_pln"] == "45.50"
    assert patch_member.json()["data"]["priority"] == 4

    members = client.get(f"/locations/{location_id}/members", headers=auth_header(ADMIN_token))
    assert members.status_code == 200
    staff_row = next(item for item in members.json()["data"] if item["id"] == staff_user_id)
    assert staff_row["max_hours_per_week"] == 30

    monday = current_monday()
    create_template(client, ADMIN_token=ADMIN_token, location_id=location_id)

    preview = client.post(
        "/schedule/generate/preview",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat()},
    )
    assert preview.status_code == 200
    preview_data = preview.json()["data"]
    assert preview_data["created_assignments"] == 0
    assert preview_data["open_shifts"][0]["unfilled_count"] == 1
    assert any("availability_missing" in item["reasons"] for item in preview_data["rejected_candidates"])


def test_generate_endpoint_does_not_publish_schedule(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Preview Only Org", email="ADMIN@preview-only.com")
    staff_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff@preview-only.com",
        full_name="Preview Staff",
        location_id=location_id,
    )
    staff_user_id = get_user_id(client, token=ADMIN_token, email="staff@preview-only.com")

    patch_member = client.patch(
        f"/locations/{location_id}/members/{staff_user_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "32.00", "priority": 5, "max_hours_per_week": 40},
    )
    assert patch_member.status_code == 200

    monday = current_monday()
    assert submit_staff_availability(client, staff_token=staff_token, week_start=monday, desired_hours=32).status_code == 200
    create_template(client, ADMIN_token=ADMIN_token, location_id=location_id)

    generate = client.post(
        "/schedule/generate",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat(), "location_id": location_id},
    )
    assert generate.status_code == 200
    assert generate.json()["data"]["created_assignments"] == 1

    shifts = client.get(
        "/schedule/shifts",
        headers=auth_header(ADMIN_token),
        params={"week_start": monday.isoformat()},
    )
    assert shifts.status_code == 200
    assert shifts.json()["data"] == []


def test_freeze_applied_week_creates_single_slot_preview_overrides(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Freeze Org", email="ADMIN@freeze.com")
    staff_a_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff-a@freeze.com",
        full_name="Freeze Staff A",
        location_id=location_id,
    )
    staff_b_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff-b@freeze.com",
        full_name="Freeze Staff B",
        location_id=location_id,
    )
    staff_a_id = get_user_id(client, token=ADMIN_token, email="staff-a@freeze.com")
    staff_b_id = get_user_id(client, token=ADMIN_token, email="staff-b@freeze.com")

    for staff_id, rate in ((staff_a_id, "28.00"), (staff_b_id, "29.00")):
        patch_member = client.patch(
            f"/locations/{location_id}/members/{staff_id}",
            headers=auth_header(ADMIN_token),
            json={"hourly_rate_pln": rate, "priority": 5, "max_hours_per_week": 40},
        )
        assert patch_member.status_code == 200

    monday = current_monday()
    assert submit_staff_availability(client, staff_token=staff_a_token, week_start=monday, desired_hours=32).status_code == 200
    assert submit_staff_availability(client, staff_token=staff_b_token, week_start=monday, desired_hours=32).status_code == 200
    create_template(client, ADMIN_token=ADMIN_token, location_id=location_id, required_count=3)

    apply = client.post(
        "/schedule/generate/apply",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat(), "location_id": location_id},
    )
    assert apply.status_code == 200
    assert apply.json()["data"]["created_assignments"] == 2

    freeze = client.post(
        "/schedule/preview/freeze-applied",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat(), "location_id": location_id},
    )
    assert freeze.status_code == 200
    freeze_items = freeze.json()["data"]
    assert len(freeze_items) == 3
    assert all(item["required_count"] == 1 for item in freeze_items)
    assert sum(1 for item in freeze_items if item["assigned_user_id"]) == 2
    assert sum(1 for item in freeze_items if item["assigned_user_id"] is None) == 1

    preview_calendar = client.get(
        "/schedule/preview/calendar",
        headers=auth_header(ADMIN_token),
        params={"week_start": monday.isoformat(), "location_id": location_id},
    )
    assert preview_calendar.status_code == 200
    open_shifts_by_day = preview_calendar.json()["data"]["open_shifts_by_day"]
    assert len(open_shifts_by_day[monday.isoformat()]) == 1


def test_manual_override_without_reason_autofills_audit(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Override Org", email="ADMIN@override.com")
    staff_a_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff-a@override.com",
        full_name="Staff A",
        location_id=location_id,
    )
    staff_b_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff-b@override.com",
        full_name="Staff B",
        location_id=location_id,
    )

    staff_a_id = get_user_id(client, token=ADMIN_token, email="staff-a@override.com")
    staff_b_id = get_user_id(client, token=ADMIN_token, email="staff-b@override.com")

    client.patch(
        f"/locations/{location_id}/members/{staff_a_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "30.00", "priority": 5, "max_hours_per_week": 40},
    )
    client.patch(
        f"/locations/{location_id}/members/{staff_b_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "25.00", "priority": 4, "max_hours_per_week": 40},
    )

    monday = current_monday()
    assert submit_staff_availability(client, staff_token=staff_a_token, week_start=monday, desired_hours=40).status_code == 200
    assert submit_staff_availability(client, staff_token=staff_b_token, week_start=monday, desired_hours=0).status_code == 200

    create_template(client, ADMIN_token=ADMIN_token, location_id=location_id)
    apply = client.post(
        "/schedule/generate/apply",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat()},
    )
    assert apply.status_code == 200

    shifts = client.get(
        "/schedule/shifts",
        headers=auth_header(ADMIN_token),
        params={"week_start": monday.isoformat()},
    ).json()["data"]
    assignment_id = shifts[0]["assignments"][0]["id"]

    no_reason = client.patch(
        f"/schedule/assignments/{assignment_id}",
        headers=auth_header(ADMIN_token),
        json={"user_id": staff_b_id},
    )
    assert no_reason.status_code == 200
    no_reason_data = no_reason.json()["data"]
    assert "desired_hours_cap_exceeded" in no_reason_data["warnings"]
    assert no_reason_data["assignment"]["override_reason"] is not None
    assert no_reason_data["assignment"]["override_reason"].startswith("Auto override:")
    assert no_reason_data["assignment"]["overridden_by"] is not None

    override = client.patch(
        f"/schedule/assignments/{assignment_id}",
        headers=auth_header(ADMIN_token),
        json={"user_id": staff_b_id, "override_reason": "Emergency coverage for sick leave"},
    )
    assert override.status_code == 200
    override_data = override.json()["data"]
    assert "desired_hours_cap_exceeded" in override_data["warnings"]
    assert override_data["assignment"]["override_reason"] == "Emergency coverage for sick leave"
    assert override_data["assignment"]["overridden_by"] is not None


def test_staff_calendar_and_shift_request_flow(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Roster Org", email="ADMIN@roster.com")

    staff_a_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff-a@roster.com",
        full_name="Staff A",
        location_id=location_id,
    )
    staff_a_id = get_user_id(client, token=ADMIN_token, email="staff-a@roster.com")
    client.patch(
        f"/locations/{location_id}/members/{staff_a_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "28.00", "priority": 5, "max_hours_per_week": 40},
    )

    monday = current_monday()
    assert submit_staff_availability(client, staff_token=staff_a_token, week_start=monday, desired_hours=40).status_code == 200

    create_template(client, ADMIN_token=ADMIN_token, location_id=location_id, required_count=2)
    generated = client.post(
        "/schedule/generate",
        headers=auth_header(ADMIN_token),
        json={"week_start": monday.isoformat()},
    )
    assert generated.status_code == 200
    assert generated.json()["data"]["created_assignments"] == 1

    staff_b_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff-b@roster.com",
        full_name="Staff B",
        location_id=location_id,
    )
    staff_b_id = get_user_id(client, token=ADMIN_token, email="staff-b@roster.com")
    client.patch(
        f"/locations/{location_id}/members/{staff_b_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "24.00", "priority": 4, "max_hours_per_week": 40},
    )
    assert submit_staff_availability(client, staff_token=staff_b_token, week_start=monday, desired_hours=24).status_code == 200

    team_calendar_b = client.get(
        "/schedule/shifts/staff",
        headers=auth_header(staff_b_token),
        params={"week_start": monday.isoformat(), "scope": "team"},
    )
    assert team_calendar_b.status_code == 200
    shift_cards = [shift for day in team_calendar_b.json()["data"] for shift in day["shifts"]]
    pickup_target = next(card for card in shift_cards if card["can_request_pickup"])

    my_calendar_a = client.get(
        "/schedule/shifts/staff",
        headers=auth_header(staff_a_token),
        params={"week_start": monday.isoformat(), "scope": "my"},
    )
    assert my_calendar_a.status_code == 200
    my_cards_a = [shift for day in my_calendar_a.json()["data"] for shift in day["shifts"]]
    assert len(my_cards_a) == 1
    assert all(card["is_mine"] for card in my_cards_a)

    create_request = client.post(
        "/schedule/requests",
        headers=auth_header(staff_b_token),
        json={
            "shift_id": pickup_target["shift_id"],
            "request_type": "pickup",
        },
    )
    assert create_request.status_code == 200
    request_id = create_request.json()["data"]["id"]

    incoming_staff = client.get("/schedule/requests", headers=auth_header(staff_b_token), params={"scope": "incoming"})
    assert incoming_staff.status_code == 403

    incoming_ADMIN = client.get("/schedule/requests", headers=auth_header(ADMIN_token), params={"scope": "incoming"})
    assert incoming_ADMIN.status_code == 200
    assert incoming_ADMIN.json()["data"][0]["id"] == request_id

    approved = client.patch(
        f"/schedule/requests/{request_id}",
        headers=auth_header(ADMIN_token),
        json={"action": "approve"},
    )
    assert approved.status_code == 200
    assert approved.json()["data"]["status"] == "approved"

    shifts_after = client.get(
        "/schedule/shifts",
        headers=auth_header(ADMIN_token),
        params={"week_start": monday.isoformat()},
    ).json()["data"]
    target_shift_after = next(item for item in shifts_after if item["id"] == pickup_target["shift_id"])
    assert len(target_shift_after["assignments"]) == 2


def test_staff_self_signup_email_pending_and_link_flow(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="OTP Org", email="ADMIN@otp.com")

    worker_email = "worker-self@otp.com"
    pending_token = signup_staff(client, full_name="OTP Worker", email=worker_email)
    pending_me = client.get("/auth/me", headers=auth_header(pending_token))
    assert pending_me.status_code == 200
    assert pending_me.json()["data"]["is_linked"] is False

    linked = client.post(
        "/organizations/members/link-by-email",
        headers=auth_header(ADMIN_token),
        json={"email": worker_email},
    )
    assert linked.status_code == 200
    assert linked.json()["data"]["status"] == "linked"

    send_login = client.post("/auth/otp/send", json={"email": worker_email, "purpose": "login"})
    assert send_login.status_code == 200
    login_code = send_login.json()["data"]["debug_code"]
    staff_login = client.post("/auth/otp/verify", json={"email": worker_email, "code": login_code, "purpose": "login"})
    assert staff_login.status_code == 200
    staff_payload = staff_login.json()["data"]
    assert staff_payload["status"] == "linked"
    assert staff_payload["role"] == "STAFF"


def test_link_by_email_negative_cases(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Link Org", email="ADMIN@link.com")
    signup_staff(client, full_name="Link Worker", email="worker@link.com")
    signup_staff(client, full_name="ADMIN Candidate", email="ADMIN-candidate@link.com")
    manager_token = invite_accept_login(client, ADMIN_token=ADMIN_token, email="manager@link.com", full_name="Manager Link", location_id=location_id)

    missing = client.post("/organizations/members/link-by-email", headers=auth_header(ADMIN_token), json={"email": "missing@link.com"})
    assert missing.status_code == 200
    assert missing.json()["data"]["status"] == "invited"

    first_link = client.post(
        "/organizations/members/link-by-email",
        headers=auth_header(ADMIN_token),
        json={"email": "worker@link.com"},
    )
    assert first_link.status_code == 200

    duplicate = client.post(
        "/organizations/members/link-by-email",
        headers=auth_header(ADMIN_token),
        json={"email": "worker@link.com"},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["data"]["status"] == "already_member"

    forbidden = client.post(
        "/organizations/members/link-by-email",
        headers=auth_header(manager_token),
        json={"email": "ADMIN-candidate@link.com"},
    )
    assert forbidden.status_code == 403


def test_timesheet_assigned_shift_submit_and_manager_review(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Timesheet Org", email="ADMIN@timesheet.com")
    staff_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff@timesheet.com",
        full_name="Timesheet Staff",
        location_id=location_id,
    )
    staff_user_id = get_user_id(client, token=ADMIN_token, email="staff@timesheet.com")
    client.patch(
        f"/locations/{location_id}/members/{staff_user_id}",
        headers=auth_header(ADMIN_token),
        json={"hourly_rate_pln": "29.00", "priority": 5},
    )

    monday = current_monday()
    assert submit_staff_availability(client, staff_token=staff_token, week_start=monday, desired_hours=32).status_code == 200
    create_template(client, ADMIN_token=ADMIN_token, location_id=location_id)
    assert client.post("/schedule/generate/apply", headers=auth_header(ADMIN_token), json={"week_start": monday.isoformat()}).status_code == 200
    shifts = client.get("/schedule/shifts", headers=auth_header(ADMIN_token), params={"week_start": monday.isoformat()}).json()["data"]
    shift_id = shifts[0]["id"]

    submit = client.post(
        "/timesheets",
        headers=auth_header(staff_token),
        json={"shift_id": shift_id, "arrived_at": "08:02:00", "left_at": "16:05:00", "note": "Normal shift"},
    )
    assert submit.status_code == 200
    timesheet_id = submit.json()["data"]["id"]
    assert submit.json()["data"]["status"] == "pending"
    assert submit.json()["data"]["is_restricted_entry"] is False

    incoming = client.get("/timesheets", headers=auth_header(ADMIN_token), params={"scope": "pending"})
    assert incoming.status_code == 200
    assert any(item["id"] == timesheet_id for item in incoming.json()["data"])

    approve = client.patch(
        f"/timesheets/{timesheet_id}",
        headers=auth_header(ADMIN_token),
        json={"action": "approve", "review_note": "Looks good"},
    )
    assert approve.status_code == 200
    assert approve.json()["data"]["status"] == "approved"


def test_timesheet_restricted_entry_requires_review_and_staff_scope_limits(client):
    ADMIN_token, location_id = signup_ADMIN(client, organization_name="Timesheet Restrict Org", email="ADMIN@timesheet2.com")
    staff_token = invite_accept_login(
        client,
        ADMIN_token=ADMIN_token,
        email="staff@timesheet2.com",
        full_name="Restricted Staff",
        location_id=location_id,
    )

    monday = current_monday()
    restricted_submit = client.post(
        "/timesheets",
        headers=auth_header(staff_token),
        json={
            "work_date": monday.isoformat(),
            "arrived_at": "10:00:00",
            "left_at": "13:30:00",
            "note": "Extra prep work",
        },
    )
    assert restricted_submit.status_code == 200
    data = restricted_submit.json()["data"]
    assert data["is_restricted_entry"] is True
    assert data["status"] == "pending"
    timesheet_id = data["id"]

    forbidden_scope = client.get("/timesheets", headers=auth_header(staff_token), params={"scope": "pending"})
    assert forbidden_scope.status_code == 403

    corrected = client.patch(
        f"/timesheets/{timesheet_id}",
        headers=auth_header(ADMIN_token),
        json={
            "action": "correct",
            "arrived_at": "10:05:00",
            "left_at": "13:20:00",
            "review_note": "Corrected by manager",
        },
    )
    assert corrected.status_code == 200
    assert corrected.json()["data"]["status"] == "corrected"
