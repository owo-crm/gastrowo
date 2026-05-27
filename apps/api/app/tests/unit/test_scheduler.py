from __future__ import annotations

from datetime import date, time
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.models import (
    Assignment,
    AvailabilitySlot,
    AvailabilityWeek,
    Location,
    LocationMembership,
    Organization,
    OrganizationMembership,
    RoleEnum,
    ScheduleWeeklyOverride,
    Shift,
    ShiftSourceEnum,
    ShiftTemplate,
    User,
)
from app.services.scheduler import (
    apply_week_schedule,
    collect_assignment_validation_issues,
    plan_week_schedule,
    shift_duration_hours,
    shifts_overlap,
)


def add_full_week_availability(
    *,
    db_session,
    organization_id,
    user_id,
    week_start: date,
    desired_hours: int,
    submitted_by,
    start_hour: int = 7,
    end_hour: int = 22,
):
    week = AvailabilityWeek(
        organization_id=organization_id,
        user_id=user_id,
        week_start=week_start,
        desired_hours=desired_hours,
        submitted_by=submitted_by,
    )
    db_session.add(week)
    db_session.flush()

    for day in range(7):
        db_session.add(
            AvailabilitySlot(
                week_id=week.id,
                user_id=user_id,
                day_of_week=day,
                start_time=time(start_hour, 0),
                end_time=time(end_hour, 0),
                is_available=True,
            )
        )

    return week


def test_shift_overlap_logic():
    assert shifts_overlap(date(2026, 4, 20), time(8, 0), time(16, 0), date(2026, 4, 20), time(12, 0), time(20, 0))
    assert not shifts_overlap(date(2026, 4, 20), time(8, 0), time(12, 0), date(2026, 4, 20), time(12, 0), time(16, 0))


def test_shift_duration_handles_overnight():
    assert shift_duration_hours(time(20, 0), time(4, 0)) == 8


def test_scheduler_ranks_by_priority_then_assigned_hours_and_computes_labor_cost(db_session):
    org = Organization(name="Priority Org")
    manager = User(email="mgr@priority.local", full_name="Manager", password_hash="x")
    staff_best = User(email="best@priority.local", full_name="Best", password_hash="x")
    staff_busy = User(email="busy@priority.local", full_name="Busy", password_hash="x")
    staff_low = User(email="low@priority.local", full_name="Low", password_hash="x")

    db_session.add_all([org, manager, staff_best, staff_busy, staff_low])
    db_session.flush()

    location = Location(organization_id=org.id, name="Warsaw", timezone="Europe/Warsaw")
    db_session.add(location)
    db_session.flush()

    db_session.add_all(
        [
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role=RoleEnum.MANAGER, max_hours_per_week=50),
            OrganizationMembership(organization_id=org.id, user_id=staff_best.id, role=RoleEnum.STAFF, max_hours_per_week=40),
            OrganizationMembership(organization_id=org.id, user_id=staff_busy.id, role=RoleEnum.STAFF, max_hours_per_week=40),
            OrganizationMembership(organization_id=org.id, user_id=staff_low.id, role=RoleEnum.STAFF, max_hours_per_week=40),
            LocationMembership(location_id=location.id, user_id=staff_best.id, hourly_rate_pln=Decimal("35.00"), priority=5),
            LocationMembership(location_id=location.id, user_id=staff_busy.id, hourly_rate_pln=Decimal("30.00"), priority=5),
            LocationMembership(location_id=location.id, user_id=staff_low.id, hourly_rate_pln=Decimal("25.00"), priority=3),
        ]
    )

    monday = date(2026, 4, 20)
    for user in (staff_best, staff_busy, staff_low):
        add_full_week_availability(
            db_session=db_session,
            organization_id=org.id,
            user_id=user.id,
            week_start=monday,
            desired_hours=40,
            submitted_by=manager.id,
        )

    manual_shift = Shift(
        organization_id=org.id,
        location_id=location.id,
        date=monday,
        start_time=time(8, 0),
        end_time=time(16, 0),
        required_role=RoleEnum.STAFF,
        required_count=1,
        source=ShiftSourceEnum.MANUAL,
        created_by=manager.id,
    )
    db_session.add(manual_shift)
    db_session.flush()
    db_session.add(Assignment(shift_id=manual_shift.id, user_id=staff_busy.id))

    db_session.add(
        ShiftTemplate(
            organization_id=org.id,
            location_id=location.id,
            day_of_week=1,
            start_time=time(8, 0),
            end_time=time(16, 0),
            required_role=RoleEnum.STAFF,
            required_count=1,
        )
    )
    db_session.commit()

    plan = plan_week_schedule(db_session, org.id, monday)

    assert plan.created_shifts == 1
    assert plan.created_assignments == 1
    assert plan.assignments[0].user_id == staff_best.id
    assert plan.assignments[0].priority == 5
    assert plan.labor_cost_summary.total_pln == Decimal("280.00")


def test_scheduler_leaves_shift_open_when_only_candidate_exceeds_desired_hours(db_session):
    org = Organization(name="Desired Org")
    manager = User(email="mgr@desired.local", full_name="Manager", password_hash="x")
    staff = User(email="staff@desired.local", full_name="Staff", password_hash="x")
    db_session.add_all([org, manager, staff])
    db_session.flush()

    location = Location(organization_id=org.id, name="Krakow", timezone="Europe/Warsaw")
    db_session.add(location)
    db_session.flush()

    db_session.add_all(
        [
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role=RoleEnum.MANAGER, max_hours_per_week=50),
            OrganizationMembership(organization_id=org.id, user_id=staff.id, role=RoleEnum.STAFF, max_hours_per_week=40),
            LocationMembership(location_id=location.id, user_id=staff.id, hourly_rate_pln=Decimal("20.00"), priority=5),
        ]
    )

    monday = date(2026, 4, 20)
    add_full_week_availability(
        db_session=db_session,
        organization_id=org.id,
        user_id=staff.id,
        week_start=monday,
        desired_hours=4,
        submitted_by=manager.id,
    )

    db_session.add(
        ShiftTemplate(
            organization_id=org.id,
            location_id=location.id,
            day_of_week=0,
            start_time=time(8, 0),
            end_time=time(16, 0),
            required_role=RoleEnum.STAFF,
            required_count=1,
        )
    )
    db_session.commit()

    plan = plan_week_schedule(db_session, org.id, monday)

    assert plan.created_assignments == 0
    assert len(plan.open_shifts) == 1
    assert plan.open_shifts[0].unfilled_count == 1
    assert any(candidate.reasons == ["desired_hours_cap_exceeded"] for candidate in plan.rejected_candidates)


def test_scheduler_requires_availability_window_coverage(db_session):
    org = Organization(name="Availability Org")
    manager = User(email="mgr@availability.local", full_name="Manager", password_hash="x")
    staff = User(email="staff@availability.local", full_name="Staff", password_hash="x")
    db_session.add_all([org, manager, staff])
    db_session.flush()

    location = Location(organization_id=org.id, name="Gdansk", timezone="Europe/Warsaw")
    db_session.add(location)
    db_session.flush()

    db_session.add_all(
        [
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role=RoleEnum.MANAGER, max_hours_per_week=50),
            OrganizationMembership(organization_id=org.id, user_id=staff.id, role=RoleEnum.STAFF, max_hours_per_week=40),
            LocationMembership(location_id=location.id, user_id=staff.id, hourly_rate_pln=Decimal("20.00"), priority=5),
        ]
    )

    monday = date(2026, 4, 20)
    add_full_week_availability(
        db_session=db_session,
        organization_id=org.id,
        user_id=staff.id,
        week_start=monday,
        desired_hours=40,
        submitted_by=manager.id,
        start_hour=10,
        end_hour=14,
    )

    db_session.add(
        ShiftTemplate(
            organization_id=org.id,
            location_id=location.id,
            day_of_week=0,
            start_time=time(8, 0),
            end_time=time(16, 0),
            required_role=RoleEnum.STAFF,
            required_count=1,
        )
    )
    db_session.commit()

    plan = plan_week_schedule(db_session, org.id, monday)

    assert plan.created_assignments == 0
    assert plan.apply_blocked is False
    assert len(plan.open_shifts) == 1
    assert len(plan.start_coverage_alerts) == 1
    assert any(candidate.reasons == ["availability_window_mismatch"] for candidate in plan.rejected_candidates)


def test_collect_assignment_validation_issues_flags_employee_constraints(db_session):
    org = Organization(name="Validation Org")
    manager = User(email="mgr@validation.local", full_name="Manager", password_hash="x")
    staff = User(email="staff@validation.local", full_name="Staff", password_hash="x")
    db_session.add_all([org, manager, staff])
    db_session.flush()

    location = Location(organization_id=org.id, name="Lodz", timezone="Europe/Warsaw")
    db_session.add(location)
    db_session.flush()

    db_session.add_all(
        [
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role=RoleEnum.MANAGER, max_hours_per_week=50),
            OrganizationMembership(organization_id=org.id, user_id=staff.id, role=RoleEnum.STAFF, max_hours_per_week=40),
            LocationMembership(location_id=location.id, user_id=staff.id, hourly_rate_pln=Decimal("22.00"), priority=5),
        ]
    )

    monday = date(2026, 4, 20)
    add_full_week_availability(
        db_session=db_session,
        organization_id=org.id,
        user_id=staff.id,
        week_start=monday,
        desired_hours=8,
        submitted_by=manager.id,
    )

    first_shift = Shift(
        organization_id=org.id,
        location_id=location.id,
        date=monday,
        start_time=time(8, 0),
        end_time=time(16, 0),
        required_role=RoleEnum.STAFF,
        required_count=1,
        source=ShiftSourceEnum.MANUAL,
        created_by=manager.id,
    )
    second_shift = Shift(
        organization_id=org.id,
        location_id=location.id,
        date=monday,
        start_time=time(16, 0),
        end_time=time(22, 0),
        required_role=RoleEnum.STAFF,
        required_count=1,
        source=ShiftSourceEnum.MANUAL,
        created_by=manager.id,
    )
    db_session.add_all([first_shift, second_shift])
    db_session.flush()
    db_session.add(Assignment(shift_id=first_shift.id, user_id=staff.id))
    db_session.commit()

    issues = collect_assignment_validation_issues(
        db=db_session,
        organization_id=org.id,
        user_id=staff.id,
        shift=second_shift,
    )

    assert "desired_hours_cap_exceeded" in issues


def test_weekly_override_replaces_template_without_duplicate(db_session):
    org = Organization(name="Override Merge Org")
    manager = User(email="mgr@merge.local", full_name="Manager", password_hash="x")
    staff = User(email="staff@merge.local", full_name="Cook One", password_hash="x")
    db_session.add_all([org, manager, staff])
    db_session.flush()

    location = Location(organization_id=org.id, name="Center", timezone="Europe/Warsaw")
    db_session.add(location)
    db_session.flush()

    db_session.add_all(
        [
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role=RoleEnum.MANAGER, max_hours_per_week=50),
            OrganizationMembership(organization_id=org.id, user_id=staff.id, role=RoleEnum.STAFF, max_hours_per_week=80, staff_position="Cook"),
            LocationMembership(location_id=location.id, user_id=staff.id, hourly_rate_pln=Decimal("30.00"), priority=5),
        ]
    )

    monday = date(2026, 4, 20)
    add_full_week_availability(
        db_session=db_session,
        organization_id=org.id,
        user_id=staff.id,
        week_start=monday,
        desired_hours=80,
        submitted_by=manager.id,
        start_hour=9,
        end_hour=23,
    )

    template = ShiftTemplate(
        organization_id=org.id,
        location_id=location.id,
        day_of_week=0,
        template_name="Cook Base",
        start_time=time(11, 0),
        end_time=time(22, 0),
        required_role=RoleEnum.STAFF,
        staff_position="Cook",
        required_count=1,
    )
    db_session.add(template)
    db_session.flush()

    db_session.add(
        ScheduleWeeklyOverride(
            organization_id=org.id,
            week_start=monday,
            source_template_id=template.id,
            location_id=location.id,
            day_of_week=0,
            start_time=time(10, 0),
            end_time=time(21, 0),
            required_role=RoleEnum.STAFF,
            staff_position="Cook",
            required_count=1,
            is_deleted=False,
            created_by=manager.id,
        )
    )
    db_session.commit()

    plan = plan_week_schedule(db_session, org.id, monday)
    assert plan.created_shifts == 1
    assert len(plan.demand_specs) == 1
    assert plan.demand_specs[0].source == "override"
    assert plan.demand_specs[0].start_time == time(10, 0)


def test_apply_is_not_blocked_when_shift_is_assigned_even_if_availability_starts_later(db_session):
    org = Organization(name="Start Coverage Org")
    manager = User(email="mgr@start.local", full_name="Manager", password_hash="x")
    staff = User(email="staff@start.local", full_name="Waiter One", password_hash="x")
    db_session.add_all([org, manager, staff])
    db_session.flush()

    location = Location(organization_id=org.id, name="Downtown", timezone="Europe/Warsaw")
    db_session.add(location)
    db_session.flush()

    db_session.add_all(
        [
            OrganizationMembership(organization_id=org.id, user_id=manager.id, role=RoleEnum.MANAGER, max_hours_per_week=50),
            OrganizationMembership(organization_id=org.id, user_id=staff.id, role=RoleEnum.STAFF, max_hours_per_week=40, staff_position="Waiter"),
            LocationMembership(location_id=location.id, user_id=staff.id, hourly_rate_pln=Decimal("24.00"), priority=5),
        ]
    )

    monday = date(2026, 4, 20)
    add_full_week_availability(
        db_session=db_session,
        organization_id=org.id,
        user_id=staff.id,
        week_start=monday,
        desired_hours=40,
        submitted_by=manager.id,
        start_hour=12,
        end_hour=22,
    )

    db_session.add(
        ShiftTemplate(
            organization_id=org.id,
            location_id=location.id,
            day_of_week=0,
            template_name="Waiter Base",
            start_time=time(11, 0),
            end_time=time(22, 0),
            required_role=RoleEnum.STAFF,
            staff_position="Waiter",
            required_count=1,
        )
    )
    db_session.commit()

    plan = plan_week_schedule(db_session, org.id, monday)
    assert plan.apply_blocked is False
    assert len(plan.start_coverage_alerts) == 1

    applied_plan = apply_week_schedule(db_session, org.id, monday, manager.id)
    assert applied_plan.created_assignments == 1
