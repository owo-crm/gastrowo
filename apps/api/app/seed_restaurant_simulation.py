from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.db import SessionLocal
from app.models import (
    Assignment,
    AssignmentStatusEnum,
    AvailabilitySlot,
    AvailabilityWeek,
    Location,
    LocationMembership,
    Organization,
    OrganizationMembership,
    PositionCatalog,
    RevenueReport,
    RoleEnum,
    Shift,
    ShiftSourceEnum,
    ShiftTemplate,
    Task,
    TaskPhoto,
    TaskStatusEnum,
    Timesheet,
    TimesheetStatusEnum,
    User,
)

ORG_NAME = "GastrOWO Pilot Restaurant"
OWNER_EMAIL = "pilot.owner@workdish.app"
OWNER_PASSWORD = "Pilot123!"
STAFF_PASSWORD = "Staff123!"
SIM_START = date(2026, 5, 1)
SIM_END = date(2026, 5, 24)


def add_minutes_to_time(source: time, minutes: int) -> time:
    base = datetime.combine(date(2026, 1, 1), source) + timedelta(minutes=minutes)
    return base.time().replace(second=0, microsecond=0)


def run_restaurant_simulation_seed() -> None:
    db = SessionLocal()
    try:
        owner = db.scalar(select(User).where(User.email == OWNER_EMAIL))
        if owner is None:
            owner = User(
                email=OWNER_EMAIL,
                full_name="Pilot Owner",
                password_hash=hash_password(OWNER_PASSWORD),
                onboarding_source="Internal demo",
            )
            db.add(owner)
            db.flush()
        else:
            owner.full_name = "Pilot Owner"
            owner.password_hash = hash_password(OWNER_PASSWORD)
            owner.onboarding_source = "Internal demo"

        org = db.scalar(select(Organization).where(Organization.name == ORG_NAME))
        if org is None:
            org = Organization(name=ORG_NAME)
            db.add(org)
            db.flush()

        org.manager_can_view_full_dashboard = True
        org.manager_can_view_payroll = True
        org.manager_can_manage_team = True
        org.manager_can_manage_business_settings = True
        org.manager_can_access_notes = True
        org.manager_can_access_inventory = True
        org.staff_can_submit_revenue_reports = True

        owner_membership = db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == owner.id,
            )
        )
        if owner_membership is None:
            owner_membership = OrganizationMembership(
                organization_id=org.id,
                user_id=owner.id,
                role=RoleEnum.ADMIN,
                max_hours_per_week=60,
                staff_position=None,
            )
            db.add(owner_membership)

        location_specs = [
            ("Central Station", "Europe/Warsaw"),
            ("Old Market", "Europe/Warsaw"),
            ("Riverside", "Europe/Warsaw"),
            ("Business Park", "Europe/Warsaw"),
        ]
        locations: list[Location] = []
        for name, timezone in location_specs:
            location = db.scalar(
                select(Location).where(
                    Location.organization_id == org.id,
                    Location.name == name,
                )
            )
            if location is None:
                location = Location(organization_id=org.id, name=name, timezone=timezone)
                db.add(location)
                db.flush()
            locations.append(location)

        for location in locations:
            location_member = db.scalar(
                select(LocationMembership).where(
                    LocationMembership.location_id == location.id,
                    LocationMembership.user_id == owner.id,
                )
            )
            if location_member is None:
                db.add(LocationMembership(location_id=location.id, user_id=owner.id, priority=5, hourly_rate_pln=0))
            else:
                location_member.priority = 5
                location_member.hourly_rate_pln = 0

        for position_name in ("Manager", "Cook", "Waiter", "Bartender"):
            exists = db.scalar(
                select(PositionCatalog).where(
                    PositionCatalog.organization_id == org.id,
                    PositionCatalog.name == position_name,
                )
            )
            if exists is None:
                db.add(PositionCatalog(organization_id=org.id, name=position_name, is_active=True))

        worker_specs = [
            ("manager.anna@workdish.app", "Anna Kowalska", RoleEnum.MANAGER, "Manager", Decimal("38.00")),
            ("manager.piotr@workdish.app", "Piotr Nowak", RoleEnum.MANAGER, "Manager", Decimal("37.50")),
            ("manager.marta@workdish.app", "Marta Zielinska", RoleEnum.MANAGER, "Manager", Decimal("39.00")),
            ("manager.dawid@workdish.app", "Dawid Wrobel", RoleEnum.MANAGER, "Manager", Decimal("37.00")),
            ("cook.kamil@workdish.app", "Kamil Szymanski", RoleEnum.STAFF, "Cook", Decimal("33.50")),
            ("cook.ewa@workdish.app", "Ewa Maj", RoleEnum.STAFF, "Cook", Decimal("32.50")),
            ("cook.michal@workdish.app", "Michal Wilk", RoleEnum.STAFF, "Cook", Decimal("34.00")),
            ("cook.ola@workdish.app", "Ola Lewandowska", RoleEnum.STAFF, "Cook", Decimal("32.00")),
            ("cook.tomek@workdish.app", "Tomek Kurek", RoleEnum.STAFF, "Cook", Decimal("33.00")),
            ("cook.julia@workdish.app", "Julia Baran", RoleEnum.STAFF, "Cook", Decimal("31.50")),
            ("waiter.igor@workdish.app", "Igor Mazur", RoleEnum.STAFF, "Waiter", Decimal("27.00")),
            ("waiter.sara@workdish.app", "Sara Dudek", RoleEnum.STAFF, "Waiter", Decimal("27.50")),
            ("waiter.lena@workdish.app", "Lena Grabowska", RoleEnum.STAFF, "Waiter", Decimal("26.50")),
            ("waiter.paulina@workdish.app", "Paulina Adamiak", RoleEnum.STAFF, "Waiter", Decimal("28.00")),
            ("waiter.bartek@workdish.app", "Bartek Jablonski", RoleEnum.STAFF, "Waiter", Decimal("26.00")),
            ("waiter.nina@workdish.app", "Nina Kaczmarek", RoleEnum.STAFF, "Waiter", Decimal("27.00")),
            ("bartender.mia@workdish.app", "Mia Lis", RoleEnum.STAFF, "Bartender", Decimal("30.00")),
            ("bartender.kasia@workdish.app", "Kasia Witek", RoleEnum.STAFF, "Bartender", Decimal("30.50")),
            ("bartender.adam@workdish.app", "Adam Ostrowski", RoleEnum.STAFF, "Bartender", Decimal("29.50")),
            ("bartender.monika@workdish.app", "Monika Pawlak", RoleEnum.STAFF, "Bartender", Decimal("31.00")),
        ]

        workers: list[tuple[User, RoleEnum, str, Decimal]] = []
        for index, (email, full_name, role, staff_position, rate) in enumerate(worker_specs):
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(
                    email=email,
                    full_name=full_name,
                    password_hash=hash_password(STAFF_PASSWORD),
                    onboarding_source="Internal demo",
                )
                db.add(user)
                db.flush()
            else:
                user.full_name = full_name
                user.password_hash = hash_password(STAFF_PASSWORD)
                user.onboarding_source = "Internal demo"

            membership = db.scalar(
                select(OrganizationMembership).where(
                    OrganizationMembership.organization_id == org.id,
                    OrganizationMembership.user_id == user.id,
                )
            )
            if membership is None:
                membership = OrganizationMembership(
                    organization_id=org.id,
                    user_id=user.id,
                    role=role,
                    max_hours_per_week=40 if role == RoleEnum.STAFF else 45,
                    staff_position=staff_position,
                )
                db.add(membership)
            else:
                membership.role = role
                membership.max_hours_per_week = 40 if role == RoleEnum.STAFF else 45
                membership.staff_position = staff_position

            primary_location = index % len(locations)
            secondary_location = (index + 1) % len(locations)
            for location_index, location in enumerate(locations):
                priority = 5 if location_index == primary_location else 3 if location_index == secondary_location else 1
                location_row = db.scalar(
                    select(LocationMembership).where(
                        LocationMembership.location_id == location.id,
                        LocationMembership.user_id == user.id,
                    )
                )
                if location_row is None:
                    db.add(
                        LocationMembership(
                            location_id=location.id,
                            user_id=user.id,
                            priority=priority,
                            hourly_rate_pln=rate,
                        )
                    )
                else:
                    location_row.priority = priority
                    location_row.hourly_rate_pln = rate

            workers.append((user, role, staff_position, rate))

        template_specs = [
            ("Lunch Manager", time(10, 0), time(18, 0), RoleEnum.MANAGER, "Manager", 1),
            ("Kitchen Core", time(10, 0), time(18, 0), RoleEnum.STAFF, "Cook", 1),
            ("Kitchen Close", time(14, 0), time(22, 0), RoleEnum.STAFF, "Cook", 1),
            ("Floor Lunch", time(11, 0), time(19, 0), RoleEnum.STAFF, "Waiter", 2),
            ("Floor Dinner", time(14, 0), time(22, 0), RoleEnum.STAFF, "Waiter", 2),
            ("Bar Evening", time(15, 0), time(23, 0), RoleEnum.STAFF, "Bartender", 1),
        ]
        for location in locations:
            for day_of_week in range(7):
                for template_name, start_time, end_time, role, staff_position, required_count in template_specs:
                    template = db.scalar(
                        select(ShiftTemplate).where(
                            ShiftTemplate.organization_id == org.id,
                            ShiftTemplate.location_id == location.id,
                            ShiftTemplate.template_name == template_name,
                            ShiftTemplate.day_of_week == day_of_week,
                            ShiftTemplate.start_time == start_time,
                            ShiftTemplate.end_time == end_time,
                            ShiftTemplate.staff_position == staff_position,
                        )
                    )
                    if template is None:
                        db.add(
                            ShiftTemplate(
                                organization_id=org.id,
                                location_id=location.id,
                                day_of_week=day_of_week,
                                template_name=template_name,
                                start_time=start_time,
                                end_time=end_time,
                                required_role=role,
                                staff_position=staff_position,
                                required_count=required_count,
                                is_active=True,
                            )
                        )
                    else:
                        template.required_count = required_count
                        template.is_active = True

        current_monday = date.today() - timedelta(days=date.today().weekday())
        next_monday = current_monday + timedelta(days=7)
        availability_windows = {
            "Manager": {0: (time(10, 0), time(18, 0)), 1: (time(10, 0), time(18, 0)), 2: (time(10, 0), time(18, 0)), 3: (time(10, 0), time(18, 0)), 4: (time(10, 0), time(18, 0)), 5: (time(11, 0), time(19, 0))},
            "Cook": {0: (time(10, 0), time(22, 0)), 1: (time(10, 0), time(22, 0)), 2: (time(10, 0), time(22, 0)), 3: (time(10, 0), time(22, 0)), 4: (time(10, 0), time(22, 0)), 5: (time(10, 0), time(22, 0)), 6: (time(10, 0), time(20, 0))},
            "Waiter": {0: (time(11, 0), time(22, 0)), 1: (time(11, 0), time(22, 0)), 2: (time(11, 0), time(22, 0)), 3: (time(11, 0), time(22, 0)), 4: (time(11, 0), time(22, 0)), 5: (time(11, 0), time(22, 0)), 6: (time(11, 0), time(20, 0))},
            "Bartender": {2: (time(15, 0), time(23, 0)), 3: (time(15, 0), time(23, 0)), 4: (time(15, 0), time(23, 0)), 5: (time(15, 0), time(23, 0)), 6: (time(14, 0), time(22, 0))},
        }
        for week_start in (current_monday, next_monday):
            for index, (user, role, staff_position, _) in enumerate(workers):
                desired_hours = 38 if role == RoleEnum.STAFF else 42
                windows = availability_windows.get(staff_position, availability_windows["Waiter"])
                week = db.scalar(
                    select(AvailabilityWeek).where(
                        AvailabilityWeek.organization_id == org.id,
                        AvailabilityWeek.user_id == user.id,
                        AvailabilityWeek.week_start == week_start,
                    )
                )
                if week is None:
                    week = AvailabilityWeek(
                        organization_id=org.id,
                        user_id=user.id,
                        week_start=week_start,
                        desired_hours=desired_hours - (index % 3),
                        submitted_by=owner.id,
                    )
                    db.add(week)
                    db.flush()
                elif week.locked_at is None:
                    week.desired_hours = desired_hours - (index % 3)
                else:
                    continue
                existing_slots = db.scalars(select(AvailabilitySlot).where(AvailabilitySlot.week_id == week.id)).all()
                for slot in existing_slots:
                    db.delete(slot)
                db.flush()
                for day_of_week, (start_time, end_time) in windows.items():
                    db.add(
                        AvailabilitySlot(
                            week_id=week.id,
                            user_id=user.id,
                            day_of_week=day_of_week,
                            start_time=start_time,
                            end_time=end_time,
                            is_available=True,
                        )
                    )

        managers = [user for user, role, position, _ in workers if role == RoleEnum.MANAGER]
        cooks = [user for user, _, position, _ in workers if position == "Cook"]
        waiters = [user for user, _, position, _ in workers if position == "Waiter"]
        bartenders = [user for user, _, position, _ in workers if position == "Bartender"]

        def ensure_shift(
            *,
            location: Location,
            work_date: date,
            start_time: time,
            end_time: time,
            required_role: RoleEnum,
            staff_position: str | None,
            required_count: int,
        ) -> Shift:
            shift = db.scalar(
                select(Shift).where(
                    Shift.organization_id == org.id,
                    Shift.location_id == location.id,
                    Shift.date == work_date,
                    Shift.start_time == start_time,
                    Shift.end_time == end_time,
                    Shift.required_role == required_role,
                    Shift.staff_position == staff_position,
                    Shift.source == ShiftSourceEnum.MANUAL,
                )
            )
            if shift is None:
                shift = Shift(
                    organization_id=org.id,
                    location_id=location.id,
                    date=work_date,
                    start_time=start_time,
                    end_time=end_time,
                    required_role=required_role,
                    staff_position=staff_position,
                    required_count=required_count,
                    source=ShiftSourceEnum.MANUAL,
                    created_by=owner.id,
                )
                db.add(shift)
                db.flush()
            else:
                shift.required_count = required_count
            return shift

        def ensure_assignment(shift: Shift, user: User) -> Assignment:
            assignment = db.scalar(select(Assignment).where(Assignment.shift_id == shift.id, Assignment.user_id == user.id))
            if assignment is None:
                assignment = Assignment(
                    shift_id=shift.id,
                    user_id=user.id,
                    status=AssignmentStatusEnum.COMPLETED if shift.date < date.today() else AssignmentStatusEnum.ASSIGNED,
                )
                db.add(assignment)
                db.flush()
            else:
                assignment.status = AssignmentStatusEnum.COMPLETED if shift.date < date.today() else AssignmentStatusEnum.ASSIGNED
            return assignment

        def ensure_timesheet(user: User, shift: Shift, arrived_at: time, left_at: time, note: str, corrected: bool = False) -> None:
            timesheet = db.scalar(
                select(Timesheet).where(
                    Timesheet.organization_id == org.id,
                    Timesheet.user_id == user.id,
                    Timesheet.shift_id == shift.id,
                )
            )
            status = TimesheetStatusEnum.CORRECTED if corrected else TimesheetStatusEnum.APPROVED
            if timesheet is None:
                db.add(
                    Timesheet(
                        organization_id=org.id,
                        user_id=user.id,
                        shift_id=shift.id,
                        work_date=shift.date,
                        arrived_at=arrived_at,
                        left_at=left_at,
                        note=note,
                        is_restricted_entry=False,
                        status=status,
                        review_note="Auto-seeded confirmed hours",
                        reviewed_by=owner.id,
                        reviewed_at=datetime.now(UTC),
                    )
                )
            else:
                timesheet.arrived_at = arrived_at
                timesheet.left_at = left_at
                timesheet.note = note
                timesheet.status = status
                timesheet.review_note = "Auto-seeded confirmed hours"
                timesheet.reviewed_by = owner.id
                timesheet.reviewed_at = datetime.now(UTC)

        def ensure_report(location: Location, work_date: date, revenue: Decimal, created_by: User) -> None:
            report = db.scalar(
                select(RevenueReport).where(
                    RevenueReport.organization_id == org.id,
                    RevenueReport.location_id == location.id,
                    RevenueReport.report_date == work_date,
                )
            )
            photo_url = f"https://picsum.photos/seed/pilot-report-{location.id}-{work_date.isoformat()}/960/720" if work_date.day % 3 == 0 else None
            if report is None:
                db.add(
                    RevenueReport(
                        organization_id=org.id,
                        location_id=location.id,
                        report_date=work_date,
                        revenue=revenue,
                        currency="PLN",
                        photo_url=photo_url,
                        created_by=created_by.id,
                    )
                )
            else:
                report.revenue = revenue
                report.photo_url = photo_url
                report.created_by = created_by.id

        def ensure_task(location: Location, work_date: date, created_by: User, assigned_to: User, title: str) -> None:
            task = db.scalar(select(Task).where(Task.organization_id == org.id, Task.title == title))
            done = work_date < date.today() - timedelta(days=1)
            if task is None:
                task = Task(
                    organization_id=org.id,
                    location_id=location.id,
                    title=title,
                    description="Seeded operational task for realistic restaurant activity.",
                    assigned_to=assigned_to.id,
                    created_by=created_by.id,
                    status=TaskStatusEnum.DONE if done else TaskStatusEnum.PENDING,
                    completed_at=datetime.combine(work_date, time(21, 30), tzinfo=UTC) if done else None,
                )
                db.add(task)
                db.flush()
            else:
                task.location_id = location.id
                task.assigned_to = assigned_to.id
                task.created_by = created_by.id
                task.status = TaskStatusEnum.DONE if done else TaskStatusEnum.PENDING
                task.completed_at = datetime.combine(work_date, time(21, 30), tzinfo=UTC) if done else None
            task_photo = db.scalar(select(TaskPhoto).where(TaskPhoto.task_id == task.id))
            if done and work_date.day % 4 == 0 and task_photo is None:
                db.add(
                    TaskPhoto(
                        task_id=task.id,
                        photo_url=f"https://picsum.photos/seed/pilot-task-{location.id}-{work_date.isoformat()}/600/420",
                        uploaded_by=assigned_to.id,
                    )
                )

        total_days = (SIM_END - SIM_START).days + 1
        for day_index in range(total_days):
            work_date = SIM_START + timedelta(days=day_index)
            weekday = work_date.weekday()
            weekend_multiplier = Decimal("1.25") if weekday in (4, 5) else Decimal("1.00")

            for location_index, location in enumerate(locations):
                def pool_pick(pool: list[User], offset: int) -> User:
                    return pool[(day_index + location_index + offset) % len(pool)]

                assigned_manager = pool_pick(managers, 0)
                lunch_cook = pool_pick(cooks, 1)
                close_cook = pool_pick(cooks, 2)
                lunch_waiter_a = pool_pick(waiters, 0)
                lunch_waiter_b = pool_pick(waiters, 1)
                dinner_waiter_a = pool_pick(waiters, 2)
                dinner_waiter_b = pool_pick(waiters, 3)
                bartender = pool_pick(bartenders, 0)

                shifts_to_staff: list[tuple[Shift, User, str, bool]] = []
                shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(10, 0), end_time=time(18, 0), required_role=RoleEnum.MANAGER, staff_position="Manager", required_count=1), assigned_manager, "Open, floor sync, close reports", False))
                shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(10, 0), end_time=time(18, 0), required_role=RoleEnum.STAFF, staff_position="Cook", required_count=1), lunch_cook, "Lunch prep and service", day_index % 6 == 0))
                shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(14, 0), end_time=time(22, 0), required_role=RoleEnum.STAFF, staff_position="Cook", required_count=1), close_cook, "Dinner service and closing", day_index % 7 == 0))
                shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(11, 0), end_time=time(19, 0), required_role=RoleEnum.STAFF, staff_position="Waiter", required_count=2), lunch_waiter_a, "Lunch floor coverage", day_index % 5 == 0))
                shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(11, 0), end_time=time(19, 0), required_role=RoleEnum.STAFF, staff_position="Waiter", required_count=2), lunch_waiter_b, "Lunch floor coverage", False))
                shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(14, 0), end_time=time(22, 0), required_role=RoleEnum.STAFF, staff_position="Waiter", required_count=2), dinner_waiter_a, "Dinner floor coverage", day_index % 8 == 0))
                shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(14, 0), end_time=time(22, 0), required_role=RoleEnum.STAFF, staff_position="Waiter", required_count=2), dinner_waiter_b, "Dinner floor coverage", False))
                if weekday >= 2:
                    shifts_to_staff.append((ensure_shift(location=location, work_date=work_date, start_time=time(15, 0), end_time=time(23, 0), required_role=RoleEnum.STAFF, staff_position="Bartender", required_count=1), bartender, "Bar service and stock close", day_index % 9 == 0))

                for slot_index, (shift, assignee, note, corrected) in enumerate(shifts_to_staff):
                    ensure_assignment(shift, assignee)
                    start_shift = (slot_index + day_index + location_index) % 5 - 2
                    end_shift = (slot_index + day_index + location_index + 2) % 5 - 2
                    ensure_timesheet(
                        assignee,
                        shift,
                        add_minutes_to_time(shift.start_time, start_shift * 5),
                        add_minutes_to_time(shift.end_time, end_shift * 5),
                        note,
                        corrected=corrected,
                    )

                base_revenue = Decimal("7800.00") + Decimal(location_index * 950) + Decimal(day_index * 135)
                service_wave = Decimal(((day_index + location_index) % 4) * 180)
                revenue = (base_revenue * weekend_multiplier + service_wave).quantize(Decimal("0.01"))
                ensure_report(location, work_date, revenue, assigned_manager)

                assignee_pool = [lunch_cook, close_cook, lunch_waiter_a, dinner_waiter_a, bartender]
                task_titles = [
                    f"{location.name} | {work_date.isoformat()} | Prep checklist",
                    f"{location.name} | {work_date.isoformat()} | Stock recount",
                    f"{location.name} | {work_date.isoformat()} | Closing QA",
                ]
                task_count = 2 if weekday < 5 else 3
                for task_offset in range(task_count):
                    ensure_task(
                        location,
                        work_date,
                        assigned_manager,
                        assignee_pool[task_offset % len(assignee_pool)],
                        task_titles[task_offset],
                    )

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run_restaurant_simulation_seed()
