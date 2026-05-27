from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    AvailabilitySlot,
    AvailabilityWeek,
    InAppNotification,
    Location,
    LocationMembership,
    OrganizationMembership,
    RoleEnum,
    Shift,
    ShiftSourceEnum,
    ShiftTemplate,
    ScheduleWeeklyOverride,
    User,
)


@dataclass
class ShiftDemand:
    shift_key: str
    template_id: UUID
    location_id: UUID
    location_name: str
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None
    required_count: int
    source: str
    override_id: UUID | None = None
    preferred_user_id: UUID | None = None


@dataclass
class PlannedAssignment:
    shift_key: str
    template_id: UUID
    location_id: UUID
    location_name: str
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    user_id: UUID
    user_name: str
    priority: int
    assigned_hours_after: float
    cost_pln: Decimal


@dataclass
class OpenShiftSummary:
    shift_key: str
    template_id: UUID
    location_id: UUID
    location_name: str
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    required_count: int
    assigned_count: int
    unfilled_count: int


@dataclass
class RejectedCandidate:
    shift_key: str
    template_id: UUID
    location_id: UUID
    date: date
    start_time: time
    end_time: time
    user_id: UUID
    user_name: str
    reasons: list[str]


@dataclass
class StartCoverageAlert:
    shift_key: str
    template_id: UUID
    location_id: UUID
    location_name: str
    date: date
    start_time: time
    end_time: time
    required_role: RoleEnum
    staff_position: str | None
    message: str


@dataclass
class FairnessSummaryRow:
    user_id: UUID
    user_name: str
    assigned_hours: float
    desired_hours: int
    desired_gap: float


@dataclass
class ScheduleLaborCostSummary:
    total_pln: Decimal
    by_day: list[dict]
    by_location: list[dict]


@dataclass
class SchedulePlanResult:
    created_shifts: int
    created_assignments: int
    assignments: list[PlannedAssignment]
    open_shifts: list[OpenShiftSummary]
    warnings: list[str]
    rejected_candidates: list[RejectedCandidate]
    labor_cost_summary: ScheduleLaborCostSummary
    fairness_summary: list[FairnessSummaryRow]
    coverage_summary: dict
    start_coverage_alerts: list[StartCoverageAlert]
    apply_blocked: bool
    demand_specs: list[ShiftDemand] = field(repr=False)


def shift_duration_hours(start_time: time, end_time: time) -> float:
    start_dt = datetime.combine(date.today(), start_time)
    end_dt = datetime.combine(date.today(), end_time)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return (end_dt - start_dt).total_seconds() / 3600


def overlap_duration_hours(a_start: time, a_end: time, b_start: time, b_end: time) -> float:
    base_date = date.today()
    a_start_dt = datetime.combine(base_date, a_start)
    a_end_dt = datetime.combine(base_date, a_end)
    if a_end_dt <= a_start_dt:
        a_end_dt += timedelta(days=1)

    b_start_dt = datetime.combine(base_date, b_start)
    b_end_dt = datetime.combine(base_date, b_end)
    if b_end_dt <= b_start_dt:
        b_end_dt += timedelta(days=1)

    overlap_seconds = (min(a_end_dt, b_end_dt) - max(a_start_dt, b_start_dt)).total_seconds()
    return max(0.0, overlap_seconds / 3600)


def shifts_overlap(a_date: date, a_start: time, a_end: time, b_date: date, b_start: time, b_end: time) -> bool:
    a_start_dt = datetime.combine(a_date, a_start)
    a_end_dt = datetime.combine(a_date, a_end)
    if a_end_dt <= a_start_dt:
        a_end_dt += timedelta(days=1)

    b_start_dt = datetime.combine(b_date, b_start)
    b_end_dt = datetime.combine(b_date, b_end)
    if b_end_dt <= b_start_dt:
        b_end_dt += timedelta(days=1)

    return a_start_dt < b_end_dt and b_start_dt < a_end_dt


def is_available_for_shift(slots: list[AvailabilitySlot], shift_day: int, shift_start: time, shift_end: time) -> bool:
    shift_hours = shift_duration_hours(shift_start, shift_end)
    # Allow realistic non-perfect windows (for example 11:00-17:00 shift and 12:00-18:00 preference).
    # Start-time strictness is handled separately via start_coverage_alerts/apply_blocked.
    min_required_overlap = min(shift_hours, max(4.0, shift_hours * 0.45))
    for slot in slots:
        if not slot.is_available or slot.day_of_week != shift_day:
            continue
        overlap_hours = overlap_duration_hours(slot.start_time, slot.end_time, shift_start, shift_end)
        if overlap_hours >= min_required_overlap:
            return True
    return False


def has_start_time_coverage(slots: list[AvailabilitySlot], shift_day: int, shift_start: time) -> bool:
    for slot in slots:
        if not slot.is_available or slot.day_of_week != shift_day:
            continue
        if slot.start_time <= shift_start < slot.end_time:
            return True
    return False


def best_overlap_hours(slots: list[AvailabilitySlot], shift_day: int, shift_start: time, shift_end: time) -> float:
    best = 0.0
    for slot in slots:
        if not slot.is_available or slot.day_of_week != shift_day:
            continue
        best = max(best, overlap_duration_hours(slot.start_time, slot.end_time, shift_start, shift_end))
    return best


def calculate_week_hours(assignments_with_shift: list[tuple[Assignment, Shift]]) -> dict[UUID, float]:
    hours_map: dict[UUID, float] = defaultdict(float)
    for assignment, shift in assignments_with_shift:
        hours_map[assignment.user_id] += shift_duration_hours(shift.start_time, shift.end_time)
    return hours_map


def _decimal_hour_cost(hourly_rate_pln: Decimal, hours: float) -> Decimal:
    return (hourly_rate_pln * Decimal(str(hours))).quantize(Decimal("0.01"))


def _build_shift_key(template_id: UUID, shift_date: date) -> str:
    return f"{template_id}:{shift_date.isoformat()}"


AUTO_PLANNING_MIN_OVERLAP_RATIO = 0.75


def _load_demand_specs(db: Session, organization_id: UUID, week_start: date, location_id: UUID | None = None) -> list[ShiftDemand]:
    locations = db.scalars(select(Location).where(Location.organization_id == organization_id)).all()
    location_name_by_id = {location.id: location.name for location in locations}
    valid_location_ids = {location.id for location in locations}
    if location_id is not None:
        if location_id not in valid_location_ids:
            return []
        valid_location_ids = {location_id}

    if not valid_location_ids:
        return []

    templates = db.scalars(
        select(ShiftTemplate)
        .where(
            ShiftTemplate.organization_id == organization_id,
            ShiftTemplate.location_id.in_(valid_location_ids),
            ShiftTemplate.is_active.is_(True),
        )
        .order_by(
            ShiftTemplate.day_of_week,
            ShiftTemplate.start_time,
            ShiftTemplate.location_id,
            ShiftTemplate.id,
        )
    ).all()

    base_specs = [
        ShiftDemand(
            shift_key=_build_shift_key(template.id, week_start + timedelta(days=template.day_of_week)),
            template_id=template.id,
            location_id=template.location_id,
            location_name=location_name_by_id.get(template.location_id, "Location"),
            date=week_start + timedelta(days=template.day_of_week),
            start_time=template.start_time,
            end_time=template.end_time,
            required_role=template.required_role,
            staff_position=template.staff_position,
            required_count=template.required_count,
            source="template",
        )
        for template in templates
    ]

    overrides = db.scalars(
        select(ScheduleWeeklyOverride).where(
            ScheduleWeeklyOverride.organization_id == organization_id,
            ScheduleWeeklyOverride.week_start == week_start,
        )
    ).all()
    if not overrides:
        return base_specs

    override_by_template_id: dict[UUID, ScheduleWeeklyOverride] = {}
    custom_overrides: list[ScheduleWeeklyOverride] = []
    for item in sorted(overrides, key=lambda row: row.updated_at):
        if item.location_id not in valid_location_ids:
            continue
        if item.source_template_id is not None:
            override_by_template_id[item.source_template_id] = item
        else:
            custom_overrides.append(item)

    merged_specs: list[ShiftDemand] = []

    for template in templates:
        template_shift_date = week_start + timedelta(days=template.day_of_week)
        override = override_by_template_id.get(template.id)
        if override is None:
            merged_specs.append(
                ShiftDemand(
                    shift_key=_build_shift_key(template.id, template_shift_date),
                    template_id=template.id,
                    location_id=template.location_id,
                    location_name=location_name_by_id.get(template.location_id, "Location"),
                    date=template_shift_date,
                    start_time=template.start_time,
                    end_time=template.end_time,
                    required_role=template.required_role,
                    staff_position=template.staff_position,
                    required_count=template.required_count,
                    source="template",
                )
            )
            continue

        if override.is_deleted or override.required_count <= 0:
            continue

        merged_specs.append(
            ShiftDemand(
                shift_key=f"override:{override.id}:{template_shift_date.isoformat()}",
                template_id=override.id,
                location_id=override.location_id,
                location_name=location_name_by_id.get(override.location_id, "Location"),
                date=template_shift_date,
                start_time=override.start_time,
                end_time=override.end_time,
                required_role=override.required_role,
                staff_position=override.staff_position,
                required_count=override.required_count,
                source="override",
                override_id=override.id,
                preferred_user_id=override.assigned_user_id,
            )
        )

    for item in custom_overrides:
        if item.is_deleted or item.required_count <= 0:
            continue
        shift_date = week_start + timedelta(days=item.day_of_week)
        merged_specs.append(
            ShiftDemand(
                shift_key=f"override:{item.id}:{shift_date.isoformat()}",
                template_id=item.id,
                location_id=item.location_id,
                location_name=location_name_by_id.get(item.location_id, "Location"),
                date=shift_date,
                start_time=item.start_time,
                end_time=item.end_time,
                required_role=item.required_role,
                staff_position=item.staff_position,
                required_count=item.required_count,
                source="override",
                override_id=item.id,
                preferred_user_id=item.assigned_user_id,
            )
        )

    merged_specs.sort(key=lambda row: (row.date, row.start_time, row.location_name, row.shift_key))
    return merged_specs


def _load_existing_assignment_rows(
    db: Session,
    organization_id: UUID,
    week_start: date,
    week_end: date,
    replaced_location_id: UUID | None = None,
    user_id: UUID | None = None,
) -> list[tuple[Assignment, Shift]]:
    query = (
        select(Assignment, Shift)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(
            Shift.organization_id == organization_id,
            Shift.date >= week_start,
            Shift.date <= week_end,
        )
    )
    if user_id is not None:
        query = query.where(Assignment.user_id == user_id)
    if replaced_location_id is None:
        query = query.where(Shift.source != ShiftSourceEnum.AUTO)
    else:
        query = query.where(
            (Shift.source != ShiftSourceEnum.AUTO) | (Shift.location_id != replaced_location_id)
        )
    return db.execute(query).all()


def _load_existing_manual_state(
    db: Session,
    organization_id: UUID,
    week_start: date,
    week_end: date,
    replaced_location_id: UUID | None = None,
) -> tuple[dict[UUID, float], dict[UUID, list[tuple[date, time, time]]]]:
    existing_rows = _load_existing_assignment_rows(
        db=db,
        organization_id=organization_id,
        week_start=week_start,
        week_end=week_end,
        replaced_location_id=replaced_location_id,
    )

    hours_by_user = calculate_week_hours(existing_rows)
    windows_by_user: dict[UUID, list[tuple[date, time, time]]] = defaultdict(list)
    for assignment, shift in existing_rows:
        windows_by_user[assignment.user_id].append((shift.date, shift.start_time, shift.end_time))

    return hours_by_user, windows_by_user


def plan_week_schedule(db: Session, organization_id: UUID, week_start: date, location_id: UUID | None = None) -> SchedulePlanResult:
    week_end = week_start + timedelta(days=6)
    demand_specs = _load_demand_specs(db, organization_id, week_start, location_id=location_id)
    if not demand_specs:
        return SchedulePlanResult(
            created_shifts=0,
            created_assignments=0,
            assignments=[],
            open_shifts=[],
            warnings=["No active templates found"],
            rejected_candidates=[],
            labor_cost_summary=ScheduleLaborCostSummary(total_pln=Decimal("0.00"), by_day=[], by_location=[]),
            fairness_summary=[],
            coverage_summary={"total_slots": 0, "filled_slots": 0, "fill_rate_pct": 0.0},
            start_coverage_alerts=[],
            apply_blocked=False,
            demand_specs=[],
        )

    memberships = db.execute(
        select(OrganizationMembership, User)
        .join(User, User.id == OrganizationMembership.user_id)
        .where(OrganizationMembership.organization_id == organization_id)
    ).all()
    membership_by_user_id = {membership.user_id: membership for membership, _ in memberships}
    user_by_id = {user.id: user for _, user in memberships}
    role_buckets: dict[RoleEnum, list[OrganizationMembership]] = defaultdict(list)
    for membership, _ in memberships:
        role_buckets[membership.role].append(membership)

    location_memberships = db.scalars(
        select(LocationMembership)
        .join(Location, Location.id == LocationMembership.location_id)
        .where(Location.organization_id == organization_id)
    ).all()
    location_member_by_key = {(item.location_id, item.user_id): item for item in location_memberships}

    availability_weeks = db.scalars(
        select(AvailabilityWeek).where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.week_start == week_start,
        )
    ).all()
    availability_week_by_user = {week.user_id: week for week in availability_weeks}
    availability_slots = db.scalars(
        select(AvailabilitySlot)
        .join(AvailabilityWeek, AvailabilityWeek.id == AvailabilitySlot.week_id)
        .where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.week_start == week_start,
        )
    ).all()
    availability_slots_by_user: dict[UUID, list[AvailabilitySlot]] = defaultdict(list)
    for slot in availability_slots:
        availability_slots_by_user[slot.user_id].append(slot)

    hours_by_user, windows_by_user = _load_existing_manual_state(
        db,
        organization_id,
        week_start,
        week_end,
        replaced_location_id=location_id,
    )

    planned_assignments: list[PlannedAssignment] = []
    rejected_candidates: list[RejectedCandidate] = []
    open_shifts: list[OpenShiftSummary] = []
    warnings: list[str] = []
    start_coverage_alerts: list[StartCoverageAlert] = []

    labor_total = Decimal("0.00")
    labor_by_day: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    labor_by_location: dict[UUID, Decimal] = defaultdict(lambda: Decimal("0.00"))

    for demand in demand_specs:
        shift_hours = shift_duration_hours(demand.start_time, demand.end_time)
        candidates = role_buckets.get(demand.required_role, [])
        eligible: list[tuple[OrganizationMembership, LocationMembership, float, User, bool]] = []
        rejected_for_demand: dict[UUID, RejectedCandidate] = {}

        for membership in candidates:
            user = user_by_id[membership.user_id]
            reasons: list[str] = []
            location_member = location_member_by_key.get((demand.location_id, membership.user_id))
            member_slots = availability_slots_by_user.get(membership.user_id, [])
            current_hours = hours_by_user.get(membership.user_id, 0.0)
            overlap_hours = 0.0
            start_covered = False
            if location_member is None:
                reasons.append("not_in_location")
            elif location_member.priority <= 0:
                reasons.append("location_priority_blocked")

            if demand.required_role == RoleEnum.STAFF:
                membership_position = (membership.staff_position or "Staff").strip().lower()
                template_position = (demand.staff_position or "Staff").strip().lower()
                if membership_position != template_position:
                    reasons.append("staff_position_mismatch")

            availability_week = availability_week_by_user.get(membership.user_id)
            if availability_week is None:
                reasons.append("availability_missing")
            else:
                overlap_hours = best_overlap_hours(
                    member_slots,
                    demand.date.weekday(),
                    demand.start_time,
                    demand.end_time,
                )
                start_covered = has_start_time_coverage(member_slots, demand.date.weekday(), demand.start_time)
                overlap_ratio = overlap_hours / shift_hours if shift_hours > 0 else 0.0
                # Auto-planning should be conservative: partial overlap is fine for manual overrides,
                # but generated shifts should stay close to submitted availability windows.
                if overlap_hours <= 0 or overlap_ratio < AUTO_PLANNING_MIN_OVERLAP_RATIO:
                    reasons.append("availability_window_mismatch")

                if current_hours + shift_hours > availability_week.desired_hours:
                    reasons.append("desired_hours_cap_exceeded")

            has_overlap = any(
                shifts_overlap(
                    a_date=existing_date,
                    a_start=existing_start,
                    a_end=existing_end,
                    b_date=demand.date,
                    b_start=demand.start_time,
                    b_end=demand.end_time,
                )
                for existing_date, existing_start, existing_end in windows_by_user.get(membership.user_id, [])
            )
            if has_overlap:
                reasons.append("overlap")

            if reasons:
                rejected_for_demand[membership.user_id] = RejectedCandidate(
                    shift_key=demand.shift_key,
                    template_id=demand.template_id,
                    location_id=demand.location_id,
                    date=demand.date,
                    start_time=demand.start_time,
                    end_time=demand.end_time,
                    user_id=membership.user_id,
                    user_name=user.full_name,
                    reasons=reasons,
                )
                continue

            assert location_member is not None
            eligible.append((membership, location_member, current_hours, user, start_covered))

        eligible.sort(
            key=lambda item: (
                0 if demand.preferred_user_id and item[0].user_id == demand.preferred_user_id else 1,
                -item[1].priority,
                item[2],
                item[3].full_name.lower(),
                str(item[0].user_id),
            )
        )
        selected = eligible[: demand.required_count]

        # Keep apply actionable, but surface shifts where nobody covers the actual start time.
        has_assigned_start_coverage = any(item[4] for item in selected)
        if not has_assigned_start_coverage:
            start_coverage_alerts.append(
                StartCoverageAlert(
                    shift_key=demand.shift_key,
                    template_id=demand.template_id,
                    location_id=demand.location_id,
                    location_name=demand.location_name,
                    date=demand.date,
                    start_time=demand.start_time,
                    end_time=demand.end_time,
                    required_role=demand.required_role,
                    staff_position=demand.staff_position,
                    message=(
                        f"No assigned employee starts at {demand.start_time.strftime('%H:%M')} "
                        f"for {demand.location_name} on {demand.date.isoformat()}"
                    ),
                )
            )

        selected_user_ids = {membership.user_id for membership, *_rest in selected}
        for user_id, rejected_candidate in rejected_for_demand.items():
            if user_id not in selected_user_ids:
                rejected_candidates.append(rejected_candidate)

        for membership, location_member, _, user, _start_covered in selected:
            updated_hours = hours_by_user.get(membership.user_id, 0.0) + shift_hours
            cost_pln = _decimal_hour_cost(Decimal(location_member.hourly_rate_pln), shift_hours)
            planned_assignments.append(
                PlannedAssignment(
                    shift_key=demand.shift_key,
                    template_id=demand.template_id,
                    location_id=demand.location_id,
                    location_name=demand.location_name,
                    date=demand.date,
                    start_time=demand.start_time,
                    end_time=demand.end_time,
                    required_role=demand.required_role,
                    user_id=membership.user_id,
                    user_name=user.full_name,
                    priority=location_member.priority,
                    assigned_hours_after=updated_hours,
                    cost_pln=cost_pln,
                )
            )
            hours_by_user[membership.user_id] = updated_hours
            windows_by_user[membership.user_id].append((demand.date, demand.start_time, demand.end_time))
            labor_total += cost_pln
            labor_by_day[demand.date.isoformat()] += cost_pln
            labor_by_location[demand.location_id] += cost_pln

        if len(selected) < demand.required_count:
            unfilled_count = demand.required_count - len(selected)
            warnings.append(
                f"{demand.location_name} {demand.date.isoformat()} {demand.start_time}-{demand.end_time}: {unfilled_count} open slot(s)"
            )
            open_shifts.append(
                OpenShiftSummary(
                    shift_key=demand.shift_key,
                    template_id=demand.template_id,
                    location_id=demand.location_id,
                    location_name=demand.location_name,
                    date=demand.date,
                    start_time=demand.start_time,
                    end_time=demand.end_time,
                    required_role=demand.required_role,
                    required_count=demand.required_count,
                    assigned_count=len(selected),
                    unfilled_count=unfilled_count,
                )
            )

    fairness_candidates = []
    for user_id, membership in membership_by_user_id.items():
        availability_week = availability_week_by_user.get(user_id)
        if availability_week is None and hours_by_user.get(user_id, 0.0) == 0:
            continue
        user = user_by_id[user_id]
        desired_hours = availability_week.desired_hours if availability_week else 0
        assigned_hours = round(hours_by_user.get(user_id, 0.0), 2)
        fairness_candidates.append(
            FairnessSummaryRow(
                user_id=user_id,
                user_name=user.full_name,
                assigned_hours=assigned_hours,
                desired_hours=desired_hours,
                desired_gap=round(desired_hours - assigned_hours, 2),
            )
        )

    fairness_candidates.sort(key=lambda item: (item.desired_gap, item.user_name.lower()))

    location_names = {
        demand.location_id: demand.location_name
        for demand in demand_specs
    }
    labor_summary = ScheduleLaborCostSummary(
        total_pln=labor_total.quantize(Decimal("0.01")),
        by_day=[
            {"date": day, "labor_cost_pln": str(total.quantize(Decimal("0.01")))}
            for day, total in sorted(labor_by_day.items())
        ],
        by_location=[
            {
                "location_id": str(location_id),
                "location_name": location_names.get(location_id, "Location"),
                "labor_cost_pln": str(total.quantize(Decimal("0.01"))),
            }
            for location_id, total in sorted(
                labor_by_location.items(),
                key=lambda item: (location_names.get(item[0], "Location"), str(item[0])),
            )
        ],
    )

    total_slots = sum(max(0, demand.required_count) for demand in demand_specs)
    filled_slots = len(planned_assignments)
    fill_rate = round((filled_slots / total_slots) * 100, 2) if total_slots else 0.0

    return SchedulePlanResult(
        created_shifts=len(demand_specs),
        created_assignments=len(planned_assignments),
        assignments=planned_assignments,
        open_shifts=open_shifts,
        warnings=warnings,
        rejected_candidates=rejected_candidates,
        labor_cost_summary=labor_summary,
        fairness_summary=fairness_candidates,
        coverage_summary={
            "total_slots": total_slots,
            "filled_slots": filled_slots,
            "fill_rate_pct": fill_rate,
        },
        start_coverage_alerts=start_coverage_alerts,
        apply_blocked=False,
        demand_specs=demand_specs,
    )


def preview_assignment_has_overlap(
    db: Session,
    organization_id: UUID,
    week_start: date,
    location_id: UUID,
    user_id: UUID,
    shift_date: date,
    start_time: time,
    end_time: time,
    exclude_override_ids: set[UUID] | None = None,
) -> bool:
    week_end = week_start + timedelta(days=6)
    existing_rows = _load_existing_assignment_rows(
        db=db,
        organization_id=organization_id,
        week_start=week_start,
        week_end=week_end,
        replaced_location_id=location_id,
        user_id=user_id,
    )
    for _assignment, existing_shift in existing_rows:
        if shifts_overlap(
            a_date=existing_shift.date,
            a_start=existing_shift.start_time,
            a_end=existing_shift.end_time,
            b_date=shift_date,
            b_start=start_time,
            b_end=end_time,
        ):
            return True

    override_rows = db.scalars(
        select(ScheduleWeeklyOverride).where(
            ScheduleWeeklyOverride.organization_id == organization_id,
            ScheduleWeeklyOverride.week_start == week_start,
            ScheduleWeeklyOverride.assigned_user_id == user_id,
        )
    ).all()
    for override in override_rows:
        if exclude_override_ids and override.id in exclude_override_ids:
            continue
        if override.is_deleted or override.required_count <= 0:
            continue
        override_date = week_start + timedelta(days=override.day_of_week)
        if shifts_overlap(
            a_date=override_date,
            a_start=override.start_time,
            a_end=override.end_time,
            b_date=shift_date,
            b_start=start_time,
            b_end=end_time,
        ):
            return True

    return False


def _plan_has_assignment_overlap(
    db: Session,
    organization_id: UUID,
    week_start: date,
    replaced_location_id: UUID | None,
    assignments: list[PlannedAssignment],
) -> bool:
    week_end = week_start + timedelta(days=6)
    windows_by_user: dict[UUID, list[tuple[date, time, time]]] = defaultdict(list)

    for assignment, shift in _load_existing_assignment_rows(
        db=db,
        organization_id=organization_id,
        week_start=week_start,
        week_end=week_end,
        replaced_location_id=replaced_location_id,
    ):
        windows_by_user[assignment.user_id].append((shift.date, shift.start_time, shift.end_time))

    for item in assignments:
        user_windows = windows_by_user[item.user_id]
        if any(
            shifts_overlap(
                a_date=existing_date,
                a_start=existing_start,
                a_end=existing_end,
                b_date=item.date,
                b_start=item.start_time,
                b_end=item.end_time,
            )
            for existing_date, existing_start, existing_end in user_windows
        ):
            return True
        user_windows.append((item.date, item.start_time, item.end_time))

    return False


def apply_week_schedule(
    db: Session,
    organization_id: UUID,
    week_start: date,
    actor_user_id: UUID,
    location_id: UUID | None = None,
) -> SchedulePlanResult:
    week_end = week_start + timedelta(days=6)
    plan = plan_week_schedule(db=db, organization_id=organization_id, week_start=week_start, location_id=location_id)
    if _plan_has_assignment_overlap(
        db=db,
        organization_id=organization_id,
        week_start=week_start,
        replaced_location_id=location_id,
        assignments=plan.assignments,
    ):
        raise HTTPException(status_code=422, detail="Schedule contains overlapping assignments for the same employee")

    existing_auto_shift_query = select(Shift.id).where(
        Shift.organization_id == organization_id,
        Shift.date >= week_start,
        Shift.date <= week_end,
        Shift.source == ShiftSourceEnum.AUTO,
    )
    if location_id is not None:
        existing_auto_shift_query = existing_auto_shift_query.where(Shift.location_id == location_id)
    existing_auto_shift_ids = db.scalars(existing_auto_shift_query).all()

    if existing_auto_shift_ids:
        db.execute(delete(Assignment).where(Assignment.shift_id.in_(existing_auto_shift_ids)))
        db.execute(delete(Shift).where(Shift.id.in_(existing_auto_shift_ids)))
        db.flush()

    shifts_by_key: dict[str, Shift] = {}
    now = datetime.now(UTC)
    template_ids = [demand.template_id for demand in plan.demand_specs if demand.source == "template"]
    templates_by_id = {
        template.id: template
        for template in db.scalars(select(ShiftTemplate).where(ShiftTemplate.id.in_(template_ids))).all()
    } if template_ids else {}

    for demand in plan.demand_specs:
        shift = Shift(
            organization_id=organization_id,
            location_id=demand.location_id,
            date=demand.date,
            start_time=demand.start_time,
            end_time=demand.end_time,
            required_role=demand.required_role,
            staff_position=demand.staff_position,
            required_count=demand.required_count,
            source=ShiftSourceEnum.AUTO,
            created_by=actor_user_id,
        )
        db.add(shift)
        shifts_by_key[demand.shift_key] = shift

        template = templates_by_id.get(demand.template_id)
        if template is not None:
            template.usage_count = (template.usage_count or 0) + 1
            template.last_used_at = now

    db.flush()

    for item in plan.assignments:
        shift = shifts_by_key[item.shift_key]
        db.add(Assignment(shift_id=shift.id, user_id=item.user_id))

    notified_user_ids = {item.user_id for item in plan.assignments}
    week_end_iso = (week_start + timedelta(days=6)).isoformat()
    for user_id in notified_user_ids:
        db.add(
            InAppNotification(
                organization_id=organization_id,
                user_id=user_id,
                title="Schedule updated",
                body=f"Your schedule for {week_start.isoformat()} - {week_end_iso} has been published.",
            )
        )

    availability_weeks = db.scalars(
        select(AvailabilityWeek).where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.week_start == week_start,
        )
    ).all()
    for availability_week in availability_weeks:
        availability_week.locked_at = now
        availability_week.locked_by = actor_user_id

    db.commit()
    return plan


def generate_week_schedule(
    db: Session,
    organization_id: UUID,
    week_start: date,
    actor_user_id: UUID,
    location_id: UUID | None = None,
) -> SchedulePlanResult:
    return apply_week_schedule(
        db=db,
        organization_id=organization_id,
        week_start=week_start,
        actor_user_id=actor_user_id,
        location_id=location_id,
    )


def get_availability_week_or_422(db: Session, organization_id: UUID, user_id: UUID, week_start: date) -> AvailabilityWeek:
    availability_week = db.scalar(
        select(AvailabilityWeek).where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.user_id == user_id,
            AvailabilityWeek.week_start == week_start,
        )
    )
    if availability_week is None:
        raise HTTPException(status_code=422, detail="Weekly availability is missing for this user")
    return availability_week


def collect_assignment_validation_issues(
    db: Session,
    organization_id: UUID,
    user_id: UUID,
    shift: Shift,
    exclude_assignment_ids: set[UUID] | None = None,
) -> list[str]:
    issues: list[str] = []
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        return ["user_not_in_organization"]

    if membership.role != shift.required_role:
        issues.append("role_mismatch")

    location_membership = db.scalar(
        select(LocationMembership).where(
            LocationMembership.location_id == shift.location_id,
            LocationMembership.user_id == user_id,
        )
    )
    if location_membership is None:
        issues.append("not_in_location")
    elif location_membership.priority <= 0:
        issues.append("location_priority_blocked")

    overlap_rows = db.execute(
        select(Assignment, Shift)
        .join(Shift, Shift.id == Assignment.shift_id)
        .where(
            Assignment.user_id == user_id,
            Shift.organization_id == organization_id,
            Shift.date >= shift.date - timedelta(days=1),
            Shift.date <= shift.date + timedelta(days=1),
        )
    ).all()
    for assignment, existing_shift in overlap_rows:
        if exclude_assignment_ids and assignment.id in exclude_assignment_ids:
            continue
        if shifts_overlap(
            a_date=existing_shift.date,
            a_start=existing_shift.start_time,
            a_end=existing_shift.end_time,
            b_date=shift.date,
            b_start=shift.start_time,
            b_end=shift.end_time,
        ):
            issues.append("overlap")
            break

    week_start = shift.date - timedelta(days=shift.date.weekday())
    availability_week = db.scalar(
        select(AvailabilityWeek).where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.user_id == user_id,
            AvailabilityWeek.week_start == week_start,
        )
    )
    if availability_week is None:
        issues.append("availability_missing")
    else:
        slots = db.scalars(
            select(AvailabilitySlot).where(AvailabilitySlot.week_id == availability_week.id)
        ).all()
        if not is_available_for_shift(slots, shift.date.weekday(), shift.start_time, shift.end_time):
            issues.append("availability_window_mismatch")

        week_end = week_start + timedelta(days=6)
        week_rows = db.execute(
            select(Assignment, Shift)
            .join(Shift, Shift.id == Assignment.shift_id)
            .where(
                Assignment.user_id == user_id,
                Shift.organization_id == organization_id,
                Shift.date >= week_start,
                Shift.date <= week_end,
            )
        ).all()
        total_hours = 0.0
        for assignment, existing_shift in week_rows:
            if exclude_assignment_ids and assignment.id in exclude_assignment_ids:
                continue
            total_hours += shift_duration_hours(existing_shift.start_time, existing_shift.end_time)
        total_hours += shift_duration_hours(shift.start_time, shift.end_time)

        if total_hours > availability_week.desired_hours:
            issues.append("desired_hours_cap_exceeded")

    return issues
