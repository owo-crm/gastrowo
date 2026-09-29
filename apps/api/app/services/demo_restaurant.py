"""Fill the owner's test business with a realistic, running restaurant.

Used from Settings → Business on the test account only. It wipes the business's own data first
(schedule, hours, revenue, tasks, team) and then builds four weeks around today: two past weeks with
worked and approved hours, the current week in progress and next week already published.
"""

from __future__ import annotations

import random
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from urllib.parse import quote
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    Assignment,
    AssignmentStatusEnum,
    AvailabilitySlot,
    AvailabilityWeek,
    ClockSession,
    InAppNotification,
    InviteToken,
    Location,
    LocationMembership,
    MemberPosition,
    NotificationTypeEnum,
    Organization,
    OrganizationMembership,
    PositionCatalog,
    RevenueReport,
    RoleEnum,
    ScheduleWeeklyOverride,
    Shift,
    ShiftRequest,
    ShiftRequestStatusEnum,
    ShiftRequestTypeEnum,
    ShiftTemplate,
    Task,
    TaskPhoto,
    TaskStatusEnum,
    Timesheet,
    TimesheetStatusEnum,
    User,
)
from app.services.billing import grant_comp_pro
from app.services.labor_rules import currency_for, default_timezone_for
from app.services.positions import ensure_catalog, replace_member_positions
from app.services.scheduler import apply_week_schedule, shift_duration_hours

DEMO_EMAIL_DOMAIN = "demo.gastrostuff.app"


@dataclass(frozen=True)
class Person:
    name: str
    positions: tuple[tuple[str, int | None], ...]  # (position, own rate or None); the first one is primary
    rate: int
    second_location: bool
    days_off: tuple[int, int]
    desired_hours: int = 40


@dataclass(frozen=True)
class Locale:
    second_location: str
    cook: str
    server: str
    bartender: str
    host: str
    dishwasher: str
    manager: Person
    staff: tuple[Person, ...]
    revenue_by_weekday: tuple[int, ...]  # Monday first, main location
    tasks: tuple[tuple[str, str], ...]
    note_swap: str
    note_pickup: str
    correction_note: str
    rejection_note: str
    extra_note: str


US = Locale(
    second_location="Downtown",
    cook="Line cook",
    server="Server",
    bartender="Bartender",
    host="Host",
    dishwasher="Dishwasher",
    manager=Person("Rachel Kim", (), 28, True, (0, 1), 40),
    staff=(
        Person("Maria Lopez", (("Line cook", None),), 21, False, (0, 1)),
        Person("James Carter", (("Line cook", None),), 20, True, (2, 3)),
        Person("Daniel Price", (("Line cook", None),), 19, True, (4, 0), 36),
        Person("Aisha Johnson", (("Server", None),), 12, False, (1, 2)),
        Person("Tyler Brooks", (("Server", None), ("Bartender", 16)), 12, False, (0, 3)),
        Person("Sofia Rossi", (("Server", None),), 12, True, (3, 4), 32),
        Person("Olivia Chen", (("Server", None),), 12, True, (5, 0), 30),
        Person("Kevin Nguyen", (("Bartender", None),), 14, False, (1, 2)),
        Person("Emma Walsh", (("Host", None),), 15, False, (0, 1), 28),
        Person("Luis Hernandez", (("Dishwasher", None),), 17, False, (1, 2)),
        Person("Marcus Reed", (("Dishwasher", None), ("Line cook", 18)), 16, True, (3, 4), 36),
    ),
    revenue_by_weekday=(1900, 1950, 2050, 2250, 2950, 3250, 2400),
    tasks=(
        ("Deep clean the walk-in cooler", "Shelves, floor and door seals. Photo when done."),
        ("Restock the bar before Friday", "Limes, simple syrup, bitters, clean glassware."),
        ("Check fryer oil", "Change it if it's darker than the reference card."),
        ("Count the linen delivery", "Compare with the invoice and note anything missing."),
        ("Update the specials board", "Weekend specials from the chef."),
        ("Descale the dishwasher", "Use the green bottle, run an empty cycle after."),
    ),
    note_swap="Family dinner that night — can anyone take it?",
    note_pickup="Happy to take extra hours this week.",
    correction_note="Clocked out 30 min earlier than written",
    rejection_note="No shift that day — please talk to Rachel",
    extra_note="Stayed late to help with a private party",
)

PL = Locale(
    second_location="Śródmieście",
    cook="Kucharz",
    server="Kelner",
    bartender="Barman",
    host="Hostessa",
    dishwasher="Zmywak",
    manager=Person("Agnieszka Dąbrowska", (), 45, True, (0, 1), 40),
    staff=(
        Person("Anna Kowalska", (("Kucharz", None),), 34, False, (0, 1)),
        Person("Piotr Nowak", (("Kucharz", None),), 32, True, (2, 3)),
        Person("Bartek Kaczmarek", (("Kucharz", None),), 31, True, (4, 0), 36),
        Person("Kasia Wiśniewska", (("Kelner", None),), 28, False, (1, 2)),
        Person("Tomek Zieliński", (("Kelner", None), ("Barman", 32)), 28, False, (0, 3)),
        Person("Ola Lewandowska", (("Kelner", None),), 28, True, (3, 4), 32),
        Person("Zosia Mazur", (("Kelner", None),), 27, True, (5, 0), 30),
        Person("Michał Wójcik", (("Barman", None),), 30, False, (1, 2)),
        Person("Julia Kamińska", (("Hostessa", None),), 27, False, (0, 1), 28),
        Person("Marek Szymański", (("Zmywak", None),), 26, False, (1, 2)),
        Person("Adam Krawczyk", (("Zmywak", None), ("Kucharz", 30)), 26, True, (3, 4), 36),
    ),
    revenue_by_weekday=(2700, 2800, 2950, 3200, 4100, 4500, 3300),
    tasks=(
        ("Umyć chłodnię", "Półki, podłoga i uszczelki drzwi. Zdjęcie po skończeniu."),
        ("Uzupełnić bar przed piątkiem", "Limonki, syrop cukrowy, bitters, czyste szkło."),
        ("Sprawdzić olej we frytownicy", "Wymienić, jeśli ciemniejszy niż wzorzec."),
        ("Przeliczyć dostawę obrusów", "Porównać z fakturą i zapisać braki."),
        ("Zaktualizować tablicę z daniami dnia", "Dania weekendowe od szefa kuchni."),
        ("Odkamienić zmywarkę", "Zielona butelka, potem pusty cykl."),
    ),
    note_swap="Rodzinna kolacja tego wieczoru — ktoś przejmie?",
    note_pickup="Chętnie wezmę dodatkowe godziny w tym tygodniu.",
    correction_note="Wyjście 30 min wcześniej niż wpisane",
    rejection_note="Brak zmiany tego dnia — porozmawiaj z Agnieszką",
    extra_note="Zostałem dłużej przy imprezie zamkniętej",
)


def _email_for(name: str, organization_id: UUID) -> str:
    ascii_name = unicodedata.normalize("NFKD", name.replace("ł", "l").replace("Ł", "L")).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z]+", ".", ascii_name.lower()).strip(".")
    return f"{slug}.{organization_id.hex[:8]}@{DEMO_EMAIL_DOMAIN}"


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def clear_business(db: Session, organization_id: UUID, keep_user_id: UUID) -> None:
    """Delete everything the business produced, and everyone in it except the caller."""
    shift_ids = select(Shift.id).where(Shift.organization_id == organization_id)
    task_ids = select(Task.id).where(Task.organization_id == organization_id)
    week_ids = select(AvailabilityWeek.id).where(AvailabilityWeek.organization_id == organization_id)
    location_ids = select(Location.id).where(Location.organization_id == organization_id)

    db.execute(delete(ClockSession).where(ClockSession.organization_id == organization_id))
    db.execute(delete(ShiftRequest).where(ShiftRequest.organization_id == organization_id))
    db.execute(delete(Timesheet).where(Timesheet.organization_id == organization_id))
    db.execute(delete(Assignment).where(Assignment.shift_id.in_(shift_ids)))
    db.execute(delete(Shift).where(Shift.organization_id == organization_id))
    db.execute(delete(ScheduleWeeklyOverride).where(ScheduleWeeklyOverride.organization_id == organization_id))
    db.execute(delete(ShiftTemplate).where(ShiftTemplate.organization_id == organization_id))
    db.execute(delete(TaskPhoto).where(TaskPhoto.task_id.in_(task_ids)))
    db.execute(delete(Task).where(Task.organization_id == organization_id))
    db.execute(delete(RevenueReport).where(RevenueReport.organization_id == organization_id))
    db.execute(delete(AvailabilitySlot).where(AvailabilitySlot.week_id.in_(week_ids)))
    db.execute(delete(AvailabilityWeek).where(AvailabilityWeek.organization_id == organization_id))
    db.execute(delete(InAppNotification).where(InAppNotification.organization_id == organization_id))
    db.execute(delete(MemberPosition).where(MemberPosition.organization_id == organization_id))
    db.execute(delete(InviteToken).where(InviteToken.organization_id == organization_id))

    other_user_ids = db.scalars(
        select(OrganizationMembership.user_id).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id != keep_user_id,
        )
    ).all()
    db.execute(
        delete(LocationMembership).where(
            LocationMembership.location_id.in_(location_ids),
            LocationMembership.user_id != keep_user_id,
        )
    )
    db.execute(
        delete(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id != keep_user_id,
        )
    )
    demo_user_ids = [
        user_id
        for user_id in db.scalars(select(User.id).where(User.id.in_(other_user_ids), User.email.like(f"%@{DEMO_EMAIL_DOMAIN}"))).all()
    ] if other_user_ids else []
    # Leftovers from an earlier fill of this same business that lost their membership.
    demo_user_ids += list(
        db.scalars(select(User.id).where(User.email.like(f"%.{organization_id.hex[:8]}@{DEMO_EMAIL_DOMAIN}"))).all()
    )
    if demo_user_ids:
        db.execute(delete(User).where(User.id.in_(set(demo_user_ids))))

    locations = db.scalars(select(Location).where(Location.organization_id == organization_id).order_by(Location.name)).all()
    for extra in locations[1:]:
        db.delete(extra)
    for item in db.scalars(select(PositionCatalog).where(PositionCatalog.organization_id == organization_id)).all():
        item.is_active = False
    db.flush()


def _template(organization_id: UUID, location_id: UUID, day: int, name: str, start: time, end: time, position: str | None, count: int = 1, role: RoleEnum = RoleEnum.STAFF) -> ShiftTemplate:
    return ShiftTemplate(
        organization_id=organization_id,
        location_id=location_id,
        day_of_week=day,
        template_name=name,
        start_time=start,
        end_time=end,
        required_role=role,
        staff_position=position,
        required_count=count,
        is_active=True,
    )


def _templates(organization_id: UUID, main: UUID, second: UUID, loc: Locale) -> list[ShiftTemplate]:
    rows: list[ShiftTemplate] = []
    for day in range(7):
        weekend = day in (4, 5)
        rows += [
            _template(organization_id, main, day, f"{loc.cook} AM", time(10), time(18), loc.cook),
            _template(organization_id, main, day, f"{loc.cook} PM", time(16), time(23), loc.cook),
            _template(organization_id, main, day, f"{loc.server} lunch", time(11), time(19), loc.server),
            _template(organization_id, main, day, f"{loc.server} dinner", time(17), time(23), loc.server, 2 if weekend else 1),
            _template(organization_id, main, day, loc.dishwasher, time(16), time(23), loc.dishwasher),
        ]
        if weekend:
            rows.append(_template(organization_id, main, day, f"{loc.bartender} late", time(18), time(2), loc.bartender))
        else:
            rows.append(_template(organization_id, main, day, loc.bartender, time(17), time(23), loc.bartender))
        if day >= 4:
            rows.append(_template(organization_id, main, day, loc.host, time(17), time(22), loc.host))
        if day >= 1:
            rows += [
                _template(organization_id, second, day, loc.cook, time(11), time(19), loc.cook),
                _template(organization_id, second, day, loc.server, time(11), time(19), loc.server),
            ]
            if weekend:
                rows.append(_template(organization_id, second, day, f"{loc.server} dinner", time(17), time(22), loc.server))
    return rows


def _availability(db: Session, organization_id: UUID, user_id: UUID, week: date, person: Person, rng: random.Random) -> None:
    availability = AvailabilityWeek(
        organization_id=organization_id,
        user_id=user_id,
        week_start=week,
        desired_hours=person.desired_hours,
        submitted_by=user_id,
        approved_at=datetime.now(UTC),
    )
    db.add(availability)
    db.flush()
    days_off = set(person.days_off)
    # Now and then someone swaps a day off, like real people do.
    if rng.random() < 0.3:
        days_off = {person.days_off[0], (person.days_off[1] + 2) % 7}
    for day in range(7):
        if day in days_off:
            continue
        db.add(
            AvailabilitySlot(
                week_id=availability.id,
                user_id=user_id,
                day_of_week=day,
                start_time=time(9),
                end_time=time(2),
                is_available=True,
            )
        )


def _shift_time(value: time, minutes: int) -> time:
    moment = datetime.combine(date(2000, 1, 3), value) + timedelta(minutes=minutes)
    return moment.time()


def _svg_photo(lines: list[tuple[str, int, str]], height: int = 360, background: str = "#fbfaf7") -> str:
    """A small drawn "photo" (receipt, checklist) as a data URL, so demo rows have something to open."""
    rows = []
    y = 44
    for text, size, weight in lines:
        safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        rows.append(f'<text x="24" y="{y}" font-family="Courier New, monospace" font-size="{size}" font-weight="{weight}" fill="#222">{safe}</text>')
        y += size + 12
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="280" height="{height}" viewBox="0 0 280 {height}">'
        f'<rect width="280" height="{height}" fill="#d9d4ca"/><rect x="10" y="10" width="260" height="{height - 20}" rx="4" fill="{background}"/>'
        + "".join(rows)
        + "</svg>"
    )
    return "data:image/svg+xml;utf8," + quote(svg)


def display_name(organization: Organization) -> str:
    """A demo business keeps a unique suffix in the database; people see just the restaurant's name."""
    return organization.name.split(" · demo ")[0] if organization.is_sandbox else organization.name


def _receipt_photo(business: str, location: str, day: date, amount: Decimal, currency: str) -> str:
    card = (amount * Decimal("0.71")).quantize(Decimal("0.01"))
    cash = amount - card
    return _svg_photo(
        [
            (business[:22], 16, "bold"),
            (location[:22], 13, "normal"),
            (day.isoformat(), 13, "normal"),
            ("-" * 24, 13, "normal"),
            (f"Card   {card:>12} {currency}", 13, "normal"),
            (f"Cash   {cash:>12} {currency}", 13, "normal"),
            ("-" * 24, 13, "normal"),
            (f"TOTAL  {amount:>12} {currency}", 15, "bold"),
            ("Z-report  #" + day.strftime("%j"), 12, "normal"),
        ]
    )


def _task_photo(title: str) -> str:
    words = title.split()
    first, second = " ".join(words[:3]), " ".join(words[3:])
    return _svg_photo([("DONE", 22, "bold"), (first[:24], 14, "normal"), (second[:24], 14, "normal"), ("checked by shift lead", 12, "normal")], 240, "#eef7ee")


def seed_demo_restaurant(db: Session, organization: Organization, admin: User, *, past_weeks: int = 2, sandbox: bool = False) -> dict[str, int]:
    """`sandbox=True` builds the public demo: a month back, people on the clock now, photos and request history."""
    organization_id = organization.id
    loc = PL if organization.country == "PL" else US
    currency = currency_for(organization.country)
    rng = random.Random(organization_id.int)

    clear_business(db, organization_id, keep_user_id=admin.id)
    grant_comp_pro(db, organization_id)

    main = db.scalar(select(Location).where(Location.organization_id == organization_id))
    if main is None:
        main = Location(organization_id=organization_id, name=organization.name, timezone=default_timezone_for(organization.country))
        db.add(main)
    second = Location(organization_id=organization_id, name=loc.second_location, timezone=main.timezone or default_timezone_for(organization.country))
    db.add(second)
    db.flush()

    ensure_catalog(db, organization_id, [loc.cook, loc.server, loc.bartender, loc.host, loc.dishwasher])

    admin_location = db.scalar(select(LocationMembership).where(LocationMembership.location_id == main.id, LocationMembership.user_id == admin.id))
    if admin_location is None:
        db.add(LocationMembership(location_id=main.id, user_id=admin.id, hourly_rate_pln=0, priority=0))
    db.add(LocationMembership(location_id=second.id, user_id=admin.id, hourly_rate_pln=0, priority=0))

    people: list[tuple[User, OrganizationMembership, Person]] = []
    password = hash_password("demo-" + organization_id.hex[:12])
    for person, role in [(loc.manager, RoleEnum.MANAGER), *[(item, RoleEnum.STAFF) for item in loc.staff]]:
        user = User(email=_email_for(person.name, organization_id), full_name=person.name, password_hash=password, onboarding_source="demo")
        db.add(user)
        db.flush()
        membership = OrganizationMembership(
            organization_id=organization_id,
            user_id=user.id,
            role=role,
            max_hours_per_week=person.desired_hours,
            staff_position=person.positions[0][0] if person.positions else None,
        )
        db.add(membership)
        db.flush()
        if person.positions:
            replace_member_positions(
                db,
                membership,
                [(name, Decimal(rate) if rate is not None else None, index == 0) for index, (name, rate) in enumerate(person.positions)],
            )
        db.add(LocationMembership(location_id=main.id, user_id=user.id, hourly_rate_pln=person.rate, priority=5 if not person.second_location else 4))
        if person.second_location:
            db.add(LocationMembership(location_id=second.id, user_id=user.id, hourly_rate_pln=person.rate, priority=4))
        people.append((user, membership, person))

    for row in _templates(organization_id, main.id, second.id, loc):
        db.add(row)
    db.flush()

    today = date.today()
    this_week = _week_start(today)
    weeks = [this_week + timedelta(weeks=offset) for offset in range(-past_weeks, 2)]
    for week in weeks:
        for user, _membership, person in people:
            _availability(db, organization_id, user.id, week, person, rng)
    db.commit()

    for week in weeks:
        apply_week_schedule(db, organization_id, week, actor_user_id=admin.id)

    # Hours: what people actually worked on past shifts.
    rows = db.execute(
        select(Assignment, Shift)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(Shift.organization_id == organization_id, Shift.date < today)
        .order_by(Shift.date, Shift.start_time)
    ).all()
    user_by_id = {user.id: user for user, *_ in people}
    reviewed_at = datetime.now(UTC)
    timesheets = 0
    hours_by_user_week: dict[tuple[UUID, date], float] = {}
    busy_days: set[tuple[UUID, date]] = set()
    for assignment, shift in rows:
        if assignment.user_id not in user_by_id:
            continue
        assignment.status = AssignmentStatusEnum.COMPLETED
        arrived = _shift_time(shift.start_time, rng.choice([-10, -5, 0, 0, 0, 5]))
        left = _shift_time(shift.end_time, rng.choice([0, 0, 0, 10, 15, 30]))
        recent = (today - shift.date).days <= 2
        status = TimesheetStatusEnum.PENDING if recent else TimesheetStatusEnum.APPROVED
        review_note = None
        if not recent and rng.random() < 0.12:
            status = TimesheetStatusEnum.CORRECTED
            left = _shift_time(left, -30)
            review_note = loc.correction_note
        db.add(
            Timesheet(
                organization_id=organization_id,
                user_id=assignment.user_id,
                shift_id=shift.id,
                work_date=shift.date,
                arrived_at=arrived,
                left_at=left,
                status=status,
                review_note=review_note,
                reviewed_by=None if status == TimesheetStatusEnum.PENDING else admin.id,
                reviewed_at=None if status == TimesheetStatusEnum.PENDING else reviewed_at,
            )
        )
        timesheets += 1
        busy_days.add((assignment.user_id, shift.date))
        if status != TimesheetStatusEnum.PENDING:
            key = (assignment.user_id, _week_start(shift.date))
            hours_by_user_week[key] = hours_by_user_week.get(key, 0.0) + shift_duration_hours(arrived, left)

    staff_users = [user for user, membership, _ in people if membership.role == RoleEnum.STAFF]
    last_week = this_week - timedelta(weeks=1)

    # One entry nobody could confirm, and one extra entry waiting for review.
    free_day = next(
        ((user, day) for user in staff_users for day in (last_week + timedelta(days=offset) for offset in range(7)) if (user.id, day) not in busy_days),
        None,
    )
    if free_day:
        db.add(
            Timesheet(
                organization_id=organization_id,
                user_id=free_day[0].id,
                work_date=free_day[1],
                arrived_at=time(12),
                left_at=time(18),
                is_restricted_entry=True,
                status=TimesheetStatusEnum.REJECTED,
                review_note=loc.rejection_note,
                reviewed_by=admin.id,
                reviewed_at=reviewed_at,
            )
        )
        busy_days.add((free_day[0].id, free_day[1]))
        timesheets += 1
    yesterday = today - timedelta(days=1)
    extra_user = next((user for user in staff_users if (user.id, yesterday) not in busy_days), staff_users[-1])
    db.add(
        Timesheet(
            organization_id=organization_id,
            user_id=extra_user.id,
            work_date=yesterday,
            arrived_at=time(18),
            left_at=time(23, 30),
            is_restricted_entry=True,
            note=loc.extra_note,
            status=TimesheetStatusEnum.PENDING,
        )
    )
    busy_days.add((extra_user.id, yesterday))
    timesheets += 1

    # US: one cook covered a sick colleague last week and went past 40 hours, so overtime shows in payroll.
    if organization.country != "PL":
        cook = next(user for user, _m, person in people if person.positions and person.positions[0][0] == loc.cook)
        worked = hours_by_user_week.get((cook.id, last_week), 0.0)
        for offset in range(7):
            if worked >= 44:
                break
            day = last_week + timedelta(days=offset)
            if (cook.id, day) in busy_days or day >= today:
                continue
            db.add(
                Timesheet(
                    organization_id=organization_id,
                    user_id=cook.id,
                    work_date=day,
                    arrived_at=time(10),
                    left_at=time(18),
                    is_restricted_entry=True,
                    note="Covered a sick call",
                    status=TimesheetStatusEnum.APPROVED,
                    reviewed_by=admin.id,
                    reviewed_at=reviewed_at,
                )
            )
            busy_days.add((cook.id, day))
            worked += 8
            timesheets += 1

    # Revenue: every past day, the second location runs smaller.
    revenue_days = 0
    day = weeks[0]
    while day < today:
        base = loc.revenue_by_weekday[day.weekday()]
        for location, factor in ((main, 1.0), (second, 0.62)):
            if location is second and day.weekday() == 0:
                continue
            amount = Decimal(str(round(base * factor * rng.uniform(0.88, 1.12), 2)))
            photo = _receipt_photo(display_name(organization), location.name, day, amount, currency) if sandbox and rng.random() < 0.45 else None
            db.add(RevenueReport(organization_id=organization_id, location_id=location.id, report_date=day, revenue=amount, currency=currency, photo_url=photo, created_by=admin.id))
        revenue_days += 1
        day += timedelta(days=1)

    # Tasks: half done already.
    for index, (title, description) in enumerate(loc.tasks):
        assignee = staff_users[(index * 3) % len(staff_users)]
        created = datetime.now(UTC) - timedelta(days=6 - index, hours=rng.randint(0, 5))
        done = index % 2 == 0
        db.add(
            Task(
                organization_id=organization_id,
                location_id=main.id,
                title=title,
                description=description,
                assigned_to=assignee.id,
                created_by=admin.id,
                status=TaskStatusEnum.DONE if done else TaskStatusEnum.PENDING,
                created_at=created,
                completed_at=created + timedelta(hours=5) if done else None,
            )
        )

    # Requests: a swap and a pickup waiting for the manager.
    upcoming = db.execute(
        select(Assignment, Shift)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(Shift.organization_id == organization_id, Shift.date > today, Shift.required_role == RoleEnum.STAFF)
        .order_by(Shift.date, Shift.start_time)
    ).all()
    requests = 0
    if upcoming:
        assignment, shift = upcoming[0]
        db.add(
            ShiftRequest(
                organization_id=organization_id,
                shift_id=shift.id,
                requester_user_id=assignment.user_id,
                requester_assignment_id=assignment.id,
                request_type=ShiftRequestTypeEnum.SWAP,
                status=ShiftRequestStatusEnum.PENDING,
                note=loc.note_swap,
            )
        )
        requests += 1
    open_shift = next(
        (
            shift
            for shift in db.scalars(
                select(Shift).where(Shift.organization_id == organization_id, Shift.date > today, Shift.required_role == RoleEnum.STAFF).order_by(Shift.date)
            ).all()
            if len(db.scalars(select(Assignment.id).where(Assignment.shift_id == shift.id)).all()) < shift.required_count
        ),
        None,
    )
    if open_shift is not None:
        taken = set(db.scalars(select(Assignment.user_id).join(Shift, Shift.id == Assignment.shift_id).where(Shift.date == open_shift.date)).all())
        volunteer = next((user for user in staff_users if user.id not in taken), None)
        if volunteer is not None:
            db.add(
                ShiftRequest(
                    organization_id=organization_id,
                    shift_id=open_shift.id,
                    requester_user_id=volunteer.id,
                    request_type=ShiftRequestTypeEnum.PICKUP,
                    status=ShiftRequestStatusEnum.PENDING,
                    note=loc.note_pickup,
                )
            )
            requests += 1

    if sandbox:
        _sandbox_extras(db, organization, admin, main, second, loc, people, staff_users, weeks, rng)

    # Scheduling notices from apply are noise here; keep a few that point the owner at real work.
    db.execute(delete(InAppNotification).where(InAppNotification.organization_id == organization_id))
    notices = [
        (NotificationTypeEnum.TIMESHEET, "Hours to approve", "New hours are waiting for your review.", "/schedule/hours"),
        (NotificationTypeEnum.SHIFT_REQUEST, "Shift requests", "A swap and a pickup are waiting for you.", "/schedule/requests"),
        (NotificationTypeEnum.SCHEDULE, "Next week is published", "Everyone can see their shifts for next week.", "/schedule"),
    ]
    for kind, title, body, url in notices:
        db.add(InAppNotification(organization_id=organization_id, user_id=admin.id, type=kind, title=title, body=body, action_url=url))

    shifts = len(db.scalars(select(Shift.id).where(Shift.organization_id == organization_id)).all())
    db.commit()
    return {
        "people": len(people),
        "locations": 2,
        "shifts": shifts,
        "timesheets": timesheets,
        "revenue_days": revenue_days,
        "tasks": len(db.scalars(select(Task.id).where(Task.organization_id == organization_id)).all()),
        "requests": requests,
    }


def _sandbox_extras(
    db: Session,
    organization: Organization,
    admin: User,
    main: Location,
    second: Location,
    loc: Locale,
    people: list[tuple[User, OrganizationMembership, Person]],
    staff_users: list[User],
    weeks: list[date],
    rng: random.Random,
) -> None:
    """What a month of a running restaurant leaves behind, on top of the regular demo fill."""
    organization_id = organization.id
    today = date.today()
    now = datetime.now(UTC)

    # Task history: the same chores came around every week, done with a photo; a few still open.
    for week in weeks[:-2]:
        for index, (title, description) in enumerate(loc.tasks[:4]):
            assignee = staff_users[(index * 5 + week.toordinal()) % len(staff_users)]
            created = datetime.combine(week + timedelta(days=index), time(9), tzinfo=UTC)
            task = Task(
                organization_id=organization_id,
                location_id=main.id if index % 3 else second.id,
                title=title,
                description=description,
                assigned_to=assignee.id,
                created_by=admin.id,
                status=TaskStatusEnum.DONE,
                created_at=created,
                completed_at=created + timedelta(hours=rng.randint(2, 30)),
            )
            db.add(task)
            db.flush()
            if rng.random() < 0.7:
                db.add(TaskPhoto(task_id=task.id, photo_url=_task_photo(title), uploaded_by=assignee.id, created_at=task.completed_at))
    for task in db.scalars(select(Task).where(
            Task.organization_id == organization_id,
            Task.status == TaskStatusEnum.DONE,
            Task.id.not_in(select(TaskPhoto.task_id)),
        )
    ).all():
        db.add(TaskPhoto(task_id=task.id, photo_url=_task_photo(task.title), uploaded_by=task.assigned_to, created_at=task.completed_at or now))

    # Requests already handled: a few swaps and pickups approved or turned down over the month.
    past = db.execute(
        select(Assignment, Shift)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(Shift.organization_id == organization_id, Shift.date < today - timedelta(days=2), Shift.required_role == RoleEnum.STAFF)
        .order_by(Shift.date)
    ).all()
    for index, (assignment, shift) in enumerate(past[:: max(1, len(past) // 6)][:6]):
        approved = index % 3 != 2
        created = datetime.combine(shift.date - timedelta(days=3), time(14), tzinfo=UTC)
        db.add(
            ShiftRequest(
                organization_id=organization_id,
                shift_id=shift.id,
                requester_user_id=assignment.user_id,
                requester_assignment_id=assignment.id if index % 2 == 0 else None,
                request_type=ShiftRequestTypeEnum.SWAP if index % 2 == 0 else ShiftRequestTypeEnum.PICKUP,
                status=ShiftRequestStatusEnum.APPROVED if approved else ShiftRequestStatusEnum.REJECTED,
                note=loc.note_swap if index % 2 == 0 else loc.note_pickup,
                resolved_by=admin.id,
                created_at=created,
                resolved_at=created + timedelta(hours=5),
            )
        )

    # Two more swaps waiting for the manager, later in the week.
    notes = (
        ("Wizyta u lekarza rano, mogę wziąć wieczór.", "Egzamin na uczelni — ktoś się zamieni?")
        if organization.country == "PL"
        else ("Doctor's appointment in the morning, happy to take an evening instead.", "Exam at college that day — anyone want to trade?")
    )
    upcoming = db.execute(
        select(Assignment, Shift)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(Shift.organization_id == organization_id, Shift.date > today + timedelta(days=1), Shift.required_role == RoleEnum.STAFF)
        .order_by(Shift.date, Shift.start_time)
    ).all()
    for note, (assignment, shift) in zip(notes, upcoming[5::9]):
        db.add(
            ShiftRequest(
                organization_id=organization_id,
                shift_id=shift.id,
                requester_user_id=assignment.user_id,
                requester_assignment_id=assignment.id,
                request_type=ShiftRequestTypeEnum.SWAP,
                status=ShiftRequestStatusEnum.PENDING,
                note=note,
                created_at=now - timedelta(hours=rng.randint(2, 20)),
            )
        )

    # Next week's availability: three people sent theirs and wait for approval.
    next_week = weeks[-1]
    for user in staff_users[:3]:
        week = db.scalar(select(AvailabilityWeek).where(AvailabilityWeek.organization_id == organization_id, AvailabilityWeek.user_id == user.id, AvailabilityWeek.week_start == next_week))
        if week is not None:
            week.approved_at = None
            week.approved_by = None

    # Who is working right now: everyone whose shift today has started clocked in, one of them is on a break.
    todays = db.execute(
        select(Assignment, Shift, Location)
        .join(Shift, Shift.id == Assignment.shift_id)
        .join(Location, Location.id == Shift.location_id)
        .where(Shift.organization_id == organization_id, Shift.date == today)
        .order_by(Shift.start_time)
    ).all()
    on_break_given = False
    for assignment, shift, location in todays:
        zone = ZoneInfo(location.timezone or "UTC")
        start = datetime.combine(today, shift.start_time, tzinfo=zone)
        end = datetime.combine(today + timedelta(days=1 if shift.end_time <= shift.start_time else 0), shift.end_time, tzinfo=zone)
        if not (start <= now.astimezone(zone) < end):
            continue
        clock_in = (start + timedelta(minutes=rng.choice([-6, -3, 0, 2, 4]))).astimezone(UTC)
        session = ClockSession(
            organization_id=organization_id,
            user_id=assignment.user_id,
            location_id=location.id,
            shift_id=shift.id,
            source=rng.choice(["phone", "kiosk"]),
            clock_in_at=min(clock_in, now - timedelta(minutes=1)),
        )
        if not on_break_given and now - session.clock_in_at > timedelta(hours=3):
            session.break_started_at = now - timedelta(minutes=12)
            on_break_given = True
        db.add(session)
    db.flush()
