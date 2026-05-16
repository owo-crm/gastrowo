from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, time
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


def run_seed() -> None:
    db = SessionLocal()
    try:
        ADMIN = db.scalar(select(User).where(User.email == "admin@workdish.app"))
        if ADMIN is None:
            ADMIN = User(
                email="admin@workdish.app",
                full_name="ADMIN Demo",
                password_hash=hash_password("ADMIN123!"),
            )
            db.add(ADMIN)
            db.flush()

        org = db.scalar(select(Organization).where(Organization.name == "Workdish Demo"))
        if org is None:
            org = Organization(name="Workdish Demo")
            db.add(org)
            db.flush()

        ADMIN_membership = db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == ADMIN.id,
            )
        )
        if ADMIN_membership is None:
            db.add(
                OrganizationMembership(
                    organization_id=org.id,
                    user_id=ADMIN.id,
                    role=RoleEnum.ADMIN,
                    max_hours_per_week=60,
                )
            )

        def ensure_location(name: str, timezone: str = "Europe/Warsaw") -> Location:
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
            return location

        seed_location_names = ["Old Town", "Riverside", "Market Hall"]
        for location_name in seed_location_names:
            ensure_location(location_name)

        all_locations = db.scalars(select(Location).where(Location.organization_id == org.id).order_by(Location.name)).all()

        for loc in all_locations:
            ADMIN_location = db.scalar(
                select(LocationMembership).where(
                    LocationMembership.location_id == loc.id,
                    LocationMembership.user_id == ADMIN.id,
                )
            )
            if ADMIN_location is None:
                db.add(LocationMembership(location_id=loc.id, user_id=ADMIN.id, priority=5, hourly_rate_pln=0))
            else:
                ADMIN_location.priority = max(ADMIN_location.priority, 5)

        def ensure_org_member(
            email: str,
            full_name: str,
            role: RoleEnum,
            staff_position: str | None = None,
            hourly_rate_pln: Decimal = Decimal("0.00"),
            priority: int = 5,
        ) -> User:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(
                    email=email,
                    full_name=full_name,
                    password_hash=hash_password("Staff123!"),
                )
                db.add(user)
                db.flush()

            membership = db.scalar(
                select(OrganizationMembership).where(
                    OrganizationMembership.organization_id == org.id,
                    OrganizationMembership.user_id == user.id,
                )
            )
            if membership is None:
                db.add(
                    OrganizationMembership(
                        organization_id=org.id,
                        user_id=user.id,
                        role=role,
                        max_hours_per_week=40,
                        staff_position=staff_position if role in (RoleEnum.STAFF, RoleEnum.MANAGER) else None,
                    )
                )
            else:
                if role in (RoleEnum.STAFF, RoleEnum.MANAGER) and staff_position:
                    membership.staff_position = staff_position

            primary_index = sum(ord(ch) for ch in email.lower()) % len(all_locations)
            for index, loc in enumerate(all_locations):
                computed_priority = priority if index == primary_index else max(1, priority - 2)
                member_location = db.scalar(
                    select(LocationMembership).where(
                        LocationMembership.location_id == loc.id,
                        LocationMembership.user_id == user.id,
                    )
                )
                if member_location is None:
                    db.add(
                        LocationMembership(
                            location_id=loc.id,
                            user_id=user.id,
                            priority=computed_priority,
                            hourly_rate_pln=hourly_rate_pln,
                        )
                    )
                else:
                    member_location.priority = computed_priority
                    member_location.hourly_rate_pln = hourly_rate_pln
            return user

        staff_members: list[tuple[User, str]] = []

        staff_demo = ensure_org_member(
            "staff@workdish.app",
            "Staff Demo",
            RoleEnum.STAFF,
            "Staff",
            Decimal("28.00"),
            priority=5,
        )
        staff_members.append((staff_demo, "Staff"))

        manager_one = ensure_org_member(
            "manager.one@workdish.app",
            "Marta Manager",
            RoleEnum.MANAGER,
            "Manager",
            Decimal("35.00"),
            priority=5,
        )
        manager_two = ensure_org_member(
            "manager.two@workdish.app",
            "Pawel Manager",
            RoleEnum.MANAGER,
            "Manager",
            Decimal("34.00"),
            priority=4,
        )

        demo_staff_by_position = [
            ("staff.alpha@workdish.app", "Alex Staff", "Staff", Decimal("27.50")),
            ("staff.beta@workdish.app", "Nina Staff", "Staff", Decimal("28.50")),
            ("cook.alpha@workdish.app", "Kamil Cook", "Cook", Decimal("33.00")),
            ("cook.beta@workdish.app", "Olga Cook", "Cook", Decimal("32.50")),
            ("bartender.alpha@workdish.app", "Mia Bartender", "Bartender", Decimal("30.00")),
            ("bartender.beta@workdish.app", "Lena Bartender", "Bartender", Decimal("29.50")),
            ("waiter.alpha@workdish.app", "Igor Waiter", "Waiter", Decimal("26.00")),
            ("waiter.beta@workdish.app", "Sara Waiter", "Waiter", Decimal("26.50")),
        ]
        for email, full_name, position, rate in demo_staff_by_position:
            member = ensure_org_member(email, full_name, RoleEnum.STAFF, position, rate, priority=5)
            staff_members.append((member, position))

        def ensure_template(
            *,
            location_id,
            template_name: str,
            day_of_week: int,
            start_time: time,
            end_time: time,
            required_role: RoleEnum,
            staff_position: str | None,
            required_count: int,
        ) -> None:
            template = db.scalar(
                select(ShiftTemplate).where(
                    ShiftTemplate.organization_id == org.id,
                    ShiftTemplate.location_id == location_id,
                    ShiftTemplate.template_name == template_name,
                    ShiftTemplate.day_of_week == day_of_week,
                    ShiftTemplate.start_time == start_time,
                    ShiftTemplate.end_time == end_time,
                    ShiftTemplate.required_role == required_role,
                    ShiftTemplate.staff_position == staff_position,
                )
            )
            if template is None:
                db.add(
                    ShiftTemplate(
                        organization_id=org.id,
                        location_id=location_id,
                        day_of_week=day_of_week,
                        template_name=template_name,
                        start_time=start_time,
                        end_time=end_time,
                        required_role=required_role,
                        staff_position=staff_position,
                        required_count=required_count,
                        is_active=True,
                    )
                )
            else:
                template.required_count = required_count
                template.is_active = True

        for loc in all_locations:
            existing_templates = db.scalars(
                select(ShiftTemplate).where(
                    ShiftTemplate.organization_id == org.id,
                    ShiftTemplate.location_id == loc.id,
                )
            ).all()
            for item in existing_templates:
                item.is_active = False

            for day_of_week in range(7):
                ensure_template(
                    location_id=loc.id,
                    template_name=f"Cook Main Shift D{day_of_week}",
                    day_of_week=day_of_week,
                    start_time=time(11, 0),
                    end_time=time(22, 0),
                    required_role=RoleEnum.STAFF,
                    staff_position="Cook",
                    required_count=1,
                )
                ensure_template(
                    location_id=loc.id,
                    template_name=f"Waiter Main Shift D{day_of_week}",
                    day_of_week=day_of_week,
                    start_time=time(11, 0),
                    end_time=time(22, 0),
                    required_role=RoleEnum.STAFF,
                    staff_position="Waiter",
                    required_count=1,
                )

        def ensure_week_availability(
            *,
            user: User,
            week_start: date,
            desired_hours: int,
            windows_by_day: dict[int, tuple[time, time]],
        ) -> None:
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
                    desired_hours=desired_hours,
                    submitted_by=ADMIN.id,
                )
                db.add(week)
                db.flush()
            elif week.locked_at is not None:
                return
            else:
                week.desired_hours = desired_hours

            existing_slots = db.scalars(select(AvailabilitySlot).where(AvailabilitySlot.week_id == week.id)).all()
            for slot in existing_slots:
                db.delete(slot)
            db.flush()

            for day_of_week, (start_time, end_time) in windows_by_day.items():
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

        monday = date.today() - timedelta(days=date.today().weekday())
        next_monday = monday + timedelta(days=7)

        staff_windows_by_position: dict[str, dict[int, tuple[time, time]]] = {
            # Non-ideal by design: overlaps enough for generation but not exact template copies.
            "Staff": {
                0: (time(10, 0), time(18, 0)),
                1: (time(12, 0), time(20, 0)),
                2: (time(11, 0), time(19, 0)),
                3: (time(13, 0), time(21, 0)),
                4: (time(10, 0), time(17, 0)),
                5: (time(11, 0), time(16, 0)),
                6: (time(12, 0), time(18, 0)),
            },
            "Cook": {
                0: (time(10, 0), time(22, 0)),
                1: (time(10, 0), time(22, 0)),
                2: (time(10, 0), time(22, 0)),
                3: (time(10, 0), time(22, 0)),
                4: (time(10, 0), time(22, 0)),
                5: (time(10, 0), time(22, 0)),
                6: (time(10, 0), time(22, 0)),
            },
            "Waiter": {
                0: (time(11, 0), time(22, 0)),
                1: (time(11, 0), time(22, 0)),
                2: (time(11, 0), time(22, 0)),
                3: (time(11, 0), time(22, 0)),
                4: (time(11, 0), time(22, 0)),
                5: (time(11, 0), time(22, 0)),
                6: (time(11, 0), time(22, 0)),
            },
            "Bartender": {
                2: (time(15, 0), time(23, 0)),
                4: (time(16, 0), time(23, 0)),
                5: (time(15, 0), time(23, 0)),
                6: (time(14, 0), time(22, 0)),
            },
            "Manager": {
                0: (time(11, 0), time(20, 0)),
                1: (time(12, 0), time(21, 0)),
                2: (time(11, 0), time(20, 0)),
                3: (time(12, 0), time(21, 0)),
                4: (time(11, 0), time(20, 0)),
            },
        }
        desired_hours_by_position = {
            "Staff": 30,
            "Cook": 90,
            "Waiter": 90,
            "Bartender": 28,
            "Manager": 36,
        }

        for week_start in (monday, next_monday):
            for index, (member, position) in enumerate(staff_members):
                desired_hours = desired_hours_by_position.get(position, 30) + (index % 2) * 2
                base_windows = staff_windows_by_position.get(position, staff_windows_by_position["Staff"])
                if index % 2 == 1:
                    varied_windows: dict[int, tuple[time, time]] = {}
                    for day_of_week, (start_slot, end_slot) in base_windows.items():
                        varied_start_hour = min(start_slot.hour + 1, 22)
                        varied_windows[day_of_week] = (time(varied_start_hour, start_slot.minute), end_slot)
                else:
                    varied_windows = base_windows
                ensure_week_availability(
                    user=member,
                    week_start=week_start,
                    desired_hours=desired_hours,
                    windows_by_day=varied_windows,
                )

            for index, manager in enumerate((manager_one, manager_two)):
                ensure_week_availability(
                    user=manager,
                    week_start=week_start,
                    desired_hours=desired_hours_by_position["Manager"] - index * 2,
                    windows_by_day=staff_windows_by_position["Manager"],
                )

        def add_minutes_to_time(source: time, minutes: int) -> time:
            base = datetime.combine(date.today(), source) + timedelta(minutes=minutes)
            return base.time().replace(second=0, microsecond=0)

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
                    created_by=ADMIN.id,
                )
                db.add(shift)
                db.flush()
            else:
                shift.required_count = required_count
            return shift

        def ensure_assignment(shift: Shift, user: User, status: AssignmentStatusEnum = AssignmentStatusEnum.COMPLETED) -> Assignment:
            assignment = db.scalar(
                select(Assignment).where(
                    Assignment.shift_id == shift.id,
                    Assignment.user_id == user.id,
                )
            )
            if assignment is None:
                assignment = Assignment(
                    shift_id=shift.id,
                    user_id=user.id,
                    status=status,
                )
                db.add(assignment)
                db.flush()
            else:
                assignment.status = status
            return assignment

        def ensure_timesheet(
            *,
            user: User,
            shift: Shift,
            arrived_at: time,
            left_at: time,
            status: TimesheetStatusEnum,
            note: str,
        ) -> None:
            existing = db.scalar(
                select(Timesheet).where(
                    Timesheet.organization_id == org.id,
                    Timesheet.user_id == user.id,
                    Timesheet.shift_id == shift.id,
                )
            )
            if existing is None:
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
                        reviewed_by=ADMIN.id if status in (TimesheetStatusEnum.APPROVED, TimesheetStatusEnum.CORRECTED) else None,
                        reviewed_at=datetime.now(UTC) if status in (TimesheetStatusEnum.APPROVED, TimesheetStatusEnum.CORRECTED) else None,
                    )
                )

        def ensure_revenue_report(*, location: Location, work_date: date, revenue: Decimal, created_by: User, photo_url: str | None) -> None:
            existing = db.scalar(
                select(RevenueReport).where(
                    RevenueReport.organization_id == org.id,
                    RevenueReport.location_id == location.id,
                    RevenueReport.report_date == work_date,
                )
            )
            if existing is None:
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
                existing.revenue = revenue
                existing.photo_url = photo_url
                existing.created_by = created_by.id

        def ensure_task(
            *,
            title: str,
            description: str,
            assigned_to: User,
            location: Location,
            created_by: User,
            status: TaskStatusEnum,
            completed_at: datetime | None,
            photo_url: str | None,
        ) -> None:
            task = db.scalar(
                select(Task).where(
                    Task.organization_id == org.id,
                    Task.title == title,
                )
            )
            if task is None:
                task = Task(
                    organization_id=org.id,
                    location_id=location.id,
                    title=title,
                    description=description,
                    assigned_to=assigned_to.id,
                    created_by=created_by.id,
                    status=status,
                    completed_at=completed_at,
                )
                db.add(task)
                db.flush()
            else:
                task.description = description
                task.assigned_to = assigned_to.id
                task.location_id = location.id
                task.created_by = created_by.id
                task.status = status
                task.completed_at = completed_at

            existing_photo = db.scalar(select(TaskPhoto).where(TaskPhoto.task_id == task.id))
            if photo_url and existing_photo is None:
                db.add(TaskPhoto(task_id=task.id, photo_url=photo_url, uploaded_by=assigned_to.id))

        cooks = [member for member, position in staff_members if position == "Cook"]
        waiters = [member for member, position in staff_members if position == "Waiter"]
        bartenders = [member for member, position in staff_members if position == "Bartender"]
        staff_general = [member for member, position in staff_members if position == "Staff"]
        managers = [manager_one, manager_two]

        today = date.today()
        current_month_start = today.replace(day=1)
        seed_end = today if today.day == 1 else today - timedelta(days=1)
        total_days = (seed_end - current_month_start).days + 1

        for day_index in range(total_days):
            work_date = current_month_start + timedelta(days=day_index)
            weekday = work_date.weekday()
            weekend_boost = Decimal("900.00") if weekday >= 4 else Decimal("0.00")

            for location_index, location in enumerate(all_locations):
                def assignment_seed(multiplier: int) -> int:
                    return day_index * 13 + location_index * 7 + multiplier

                if cooks:
                    cook = cooks[(day_index + location_index) % len(cooks)]
                    cook_shift = ensure_shift(
                        location=location,
                        work_date=work_date,
                        start_time=time(11, 0),
                        end_time=time(20, 0),
                        required_role=RoleEnum.STAFF,
                        staff_position="Cook",
                        required_count=1,
                    )
                    ensure_assignment(cook_shift, cook)
                    ensure_timesheet(
                        user=cook,
                        shift=cook_shift,
                        arrived_at=add_minutes_to_time(time(11, 0), (assignment_seed(1) % 5 - 2) * 5),
                        left_at=add_minutes_to_time(time(20, 0), (assignment_seed(2) % 5 - 2) * 5),
                        status=TimesheetStatusEnum.CORRECTED if assignment_seed(3) % 6 == 0 else TimesheetStatusEnum.APPROVED,
                        note="Kitchen closeout and prep",
                    )

                if waiters:
                    waiter = waiters[(day_index + location_index) % len(waiters)]
                    waiter_shift = ensure_shift(
                        location=location,
                        work_date=work_date,
                        start_time=time(11, 0),
                        end_time=time(20, 0),
                        required_role=RoleEnum.STAFF,
                        staff_position="Waiter",
                        required_count=1,
                    )
                    ensure_assignment(waiter_shift, waiter)
                    ensure_timesheet(
                        user=waiter,
                        shift=waiter_shift,
                        arrived_at=add_minutes_to_time(time(11, 0), (assignment_seed(4) % 5 - 2) * 5),
                        left_at=add_minutes_to_time(time(20, 0), (assignment_seed(5) % 7 - 3) * 5),
                        status=TimesheetStatusEnum.CORRECTED if assignment_seed(6) % 7 == 0 else TimesheetStatusEnum.APPROVED,
                        note="Floor service and closing",
                    )

                if managers and weekday < 5:
                    manager = managers[(day_index + location_index) % len(managers)]
                    manager_shift = ensure_shift(
                        location=location,
                        work_date=work_date,
                        start_time=time(10, 0),
                        end_time=time(18, 0),
                        required_role=RoleEnum.MANAGER,
                        staff_position="Manager",
                        required_count=1,
                    )
                    ensure_assignment(manager_shift, manager)
                    ensure_timesheet(
                        user=manager,
                        shift=manager_shift,
                        arrived_at=add_minutes_to_time(time(10, 0), (assignment_seed(7) % 3) * 5),
                        left_at=add_minutes_to_time(time(18, 0), -((assignment_seed(8) % 3) * 5)),
                        status=TimesheetStatusEnum.APPROVED,
                        note="Manager coverage",
                    )

                if bartenders and weekday >= 3:
                    bartender = bartenders[(day_index + location_index) % len(bartenders)]
                    bartender_shift = ensure_shift(
                        location=location,
                        work_date=work_date,
                        start_time=time(16, 0),
                        end_time=time(23, 0),
                        required_role=RoleEnum.STAFF,
                        staff_position="Bartender",
                        required_count=1,
                    )
                    ensure_assignment(bartender_shift, bartender)
                    ensure_timesheet(
                        user=bartender,
                        shift=bartender_shift,
                        arrived_at=add_minutes_to_time(time(16, 0), (assignment_seed(9) % 5 - 2) * 5),
                        left_at=add_minutes_to_time(time(23, 0), (assignment_seed(10) % 5 - 2) * 5),
                        status=TimesheetStatusEnum.APPROVED,
                        note="Bar shift",
                    )

                if staff_general and weekday in (1, 3, 5):
                    support_staff = staff_general[(day_index + location_index) % len(staff_general)]
                    support_shift = ensure_shift(
                        location=location,
                        work_date=work_date,
                        start_time=time(12, 0),
                        end_time=time(18, 0),
                        required_role=RoleEnum.STAFF,
                        staff_position="Staff",
                        required_count=1,
                    )
                    ensure_assignment(support_shift, support_staff)
                    ensure_timesheet(
                        user=support_staff,
                        shift=support_shift,
                        arrived_at=add_minutes_to_time(time(12, 0), (assignment_seed(11) % 5 - 2) * 5),
                        left_at=add_minutes_to_time(time(18, 0), (assignment_seed(12) % 5 - 2) * 5),
                        status=TimesheetStatusEnum.APPROVED,
                        note="General support",
                    )

                revenue_value = (
                    Decimal("4200.00")
                    + Decimal(location_index * 650)
                    + Decimal(day_index * 95)
                    + weekend_boost
                    + Decimal((day_index + location_index) % 4) * Decimal("110.00")
                ).quantize(Decimal("0.01"))
                report_owner = managers[(day_index + location_index) % len(managers)] if managers else ADMIN
                photo_url = (
                    f"https://picsum.photos/seed/report-{location.id}-{work_date.isoformat()}/960/720"
                    if (day_index + location_index) % 3 == 0
                    else None
                )
                ensure_revenue_report(
                    location=location,
                    work_date=work_date,
                    revenue=revenue_value,
                    created_by=report_owner,
                    photo_url=photo_url,
                )

                if (day_index + location_index) % 2 == 0:
                    assignee_pool = cooks + waiters + bartenders + staff_general
                    if assignee_pool:
                        assignee = assignee_pool[(day_index + location_index) % len(assignee_pool)]
                        task_title = f"{location.name} • {work_date.isoformat()} • {['Prep', 'Stock', 'Deep clean', 'Closing check'][day_index % 4]}"
                        task_status = TaskStatusEnum.DONE if work_date < today - timedelta(days=2) else TaskStatusEnum.PENDING
                        completed_at = (
                            datetime.combine(work_date, time(21, 30), tzinfo=UTC)
                            if task_status == TaskStatusEnum.DONE
                            else None
                        )
                        task_photo = (
                            f"https://picsum.photos/seed/task-{location.id}-{work_date.isoformat()}/600/420"
                            if task_status == TaskStatusEnum.DONE and day_index % 3 == 0
                            else None
                        )
                        ensure_task(
                            title=task_title,
                            description="Seeded operational task for demo history and dashboard activity.",
                            assigned_to=assignee,
                            location=location,
                            created_by=report_owner,
                            status=task_status,
                            completed_at=completed_at,
                            photo_url=task_photo,
                        )

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
