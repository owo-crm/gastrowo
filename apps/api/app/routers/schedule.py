from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import (
    Assignment,
    AssignmentStatusEnum,
    InAppNotification,
    Location,
    LocationMembership,
    OrganizationMembership,
    RoleEnum,
    Shift,
    ShiftRequest,
    ShiftRequestStatusEnum,
    ShiftRequestTypeEnum,
    ScheduleWeeklyOverride,
    ShiftTemplate,
    User,
)
from app.schemas import (
    AssignmentPatch,
    ScheduleGenerateRequest,
    SchedulePreviewMaterializeRequest,
    SchedulePreviewEditPatch,
    SchedulePreviewAssignmentOut,
    SchedulePreviewCalendarOut,
    PreviewCalendarCellOut,
    PreviewCalendarRowOut,
    SchedulePreviewOpenShiftOut,
    SchedulePreviewOut,
    SchedulePreviewRejectedCandidateOut,
    WeeklyShiftOverrideBulkIn,
    WeeklyShiftOverrideIn,
    WeeklyShiftOverrideOut,
    ShiftOut,
    ShiftRequestCreate,
    ShiftRequestOut,
    ShiftRequestPatch,
    ShiftTemplatePatch,
    ShiftTemplateCreate,
    ShiftTemplateOut,
    StaffCalendarDayOut,
)
from app.services.scheduler import (
    apply_week_schedule,
    collect_assignment_validation_issues,
    plan_week_schedule,
    preview_assignment_has_overlap,
    shift_duration_hours,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _get_shift_or_404(db: Session, shift_id: UUID, organization_id: UUID) -> Shift:
    shift = db.get(Shift, shift_id)
    if shift is None or shift.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Shift not found")
    return shift


def _serialize_plan(plan) -> dict:
    return SchedulePreviewOut(
        created_shifts=plan.created_shifts,
        created_assignments=plan.created_assignments,
        assignments=[
            SchedulePreviewAssignmentOut(
                shift_key=item.shift_key,
                template_id=item.template_id,
                location_id=item.location_id,
                location_name=item.location_name,
                date=item.date,
                start_time=item.start_time,
                end_time=item.end_time,
                required_role=item.required_role,
                user_id=item.user_id,
                user_name=item.user_name,
                priority=item.priority,
                assigned_hours_after=item.assigned_hours_after,
                cost_pln=item.cost_pln,
            )
            for item in plan.assignments
        ],
        open_shifts=[
            SchedulePreviewOpenShiftOut(
                shift_key=item.shift_key,
                template_id=item.template_id,
                location_id=item.location_id,
                location_name=item.location_name,
                date=item.date,
                start_time=item.start_time,
                end_time=item.end_time,
                required_role=item.required_role,
                required_count=item.required_count,
                assigned_count=item.assigned_count,
                unfilled_count=item.unfilled_count,
            )
            for item in plan.open_shifts
        ],
        warnings=plan.warnings,
        rejected_candidates=[
            SchedulePreviewRejectedCandidateOut(
                shift_key=item.shift_key,
                template_id=item.template_id,
                location_id=item.location_id,
                date=item.date,
                start_time=item.start_time,
                end_time=item.end_time,
                user_id=item.user_id,
                user_name=item.user_name,
                reasons=item.reasons,
            )
            for item in plan.rejected_candidates
        ],
        labor_cost_summary={
            "total_pln": plan.labor_cost_summary.total_pln,
            "by_day": plan.labor_cost_summary.by_day,
            "by_location": plan.labor_cost_summary.by_location,
        },
        fairness_summary=[
            {
                "user_id": item.user_id,
                "user_name": item.user_name,
                "assigned_hours": item.assigned_hours,
                "desired_hours": item.desired_hours,
                "desired_gap": item.desired_gap,
            }
            for item in plan.fairness_summary
        ],
        coverage_summary=plan.coverage_summary,
        start_coverage_alerts=[
            {
                "shift_key": item.shift_key,
                "template_id": item.template_id,
                "location_id": item.location_id,
                "location_name": item.location_name,
                "date": item.date,
                "start_time": item.start_time,
                "end_time": item.end_time,
                "required_role": item.required_role,
                "staff_position": item.staff_position,
                "message": item.message,
            }
            for item in plan.start_coverage_alerts
        ],
        apply_blocked=plan.apply_blocked,
    ).model_dump(mode="json")


def _serialize_override(item: ScheduleWeeklyOverride) -> dict:
    return WeeklyShiftOverrideOut.model_validate(item).model_dump(mode="json")


def _replace_location_overrides(
    db: Session,
    *,
    organization_id: UUID,
    week_start: date,
    location_id: UUID,
    created_by: UUID,
    overrides: list[ScheduleWeeklyOverride],
) -> list[ScheduleWeeklyOverride]:
    db.execute(
        delete(ScheduleWeeklyOverride).where(
            ScheduleWeeklyOverride.organization_id == organization_id,
            ScheduleWeeklyOverride.week_start == week_start,
            ScheduleWeeklyOverride.location_id == location_id,
        )
    )
    created: list[ScheduleWeeklyOverride] = []
    for item in overrides:
        item.organization_id = organization_id
        item.week_start = week_start
        item.location_id = location_id
        item.created_by = created_by
        db.add(item)
        created.append(item)
    db.commit()
    for item in created:
        db.refresh(item)
    return created


def _build_materialized_preview_overrides(
    *,
    plan,
    week_start: date,
    location_id: UUID,
    created_by: UUID,
) -> list[ScheduleWeeklyOverride]:
    assignments_by_shift: dict[str, list] = defaultdict(list)
    for assignment in plan.assignments:
        if assignment.location_id != location_id:
            continue
        assignments_by_shift[assignment.shift_key].append(assignment)

    created: list[ScheduleWeeklyOverride] = []
    for demand in plan.demand_specs:
        if demand.location_id != location_id:
            continue
        source_template_id = demand.template_id if demand.source == "template" else None
        demand_assignments = assignments_by_shift.get(demand.shift_key, [])
        for assignment in demand_assignments:
            created.append(
                ScheduleWeeklyOverride(
                    organization_id=UUID(int=0),
                    week_start=week_start,
                    source_template_id=source_template_id,
                    location_id=location_id,
                    day_of_week=demand.date.weekday(),
                    start_time=demand.start_time,
                    end_time=demand.end_time,
                    required_role=demand.required_role,
                    staff_position=demand.staff_position,
                    required_count=1,
                    is_deleted=False,
                    assigned_user_id=assignment.user_id,
                    created_by=created_by,
                )
            )
        missing_count = max(0, demand.required_count - len(demand_assignments))
        for _ in range(missing_count):
            created.append(
                ScheduleWeeklyOverride(
                    organization_id=UUID(int=0),
                    week_start=week_start,
                    source_template_id=source_template_id,
                    location_id=location_id,
                    day_of_week=demand.date.weekday(),
                    start_time=demand.start_time,
                    end_time=demand.end_time,
                    required_role=demand.required_role,
                    staff_position=demand.staff_position,
                    required_count=1,
                    is_deleted=False,
                    assigned_user_id=None,
                    created_by=created_by,
                )
            )

    return created


def _build_preview_calendar(plan, users: list[tuple[OrganizationMembership, User]], week_start: date) -> dict:
    week_days = [week_start + timedelta(days=index) for index in range(7)]
    assignment_by_shift: dict[str, list[dict]] = defaultdict(list)
    for item in plan.assignments:
        assignment_by_shift[item.shift_key].append(
            {
                "user_id": item.user_id,
                "user_name": item.user_name,
                "priority": item.priority,
            }
        )

    demand_by_user_day: dict[UUID, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    open_by_day: dict[str, list[dict]] = defaultdict(list)

    for demand in plan.demand_specs:
        assigned_users = assignment_by_shift.get(demand.shift_key, [])
        missing_count = max(0, demand.required_count - len(assigned_users))
        cell = PreviewCalendarCellOut(
            shift_key=demand.shift_key,
            location_id=demand.location_id,
            location_name=demand.location_name,
            date=demand.date,
            day_of_week=demand.date.weekday(),
            start_time=demand.start_time,
            end_time=demand.end_time,
            required_role=demand.required_role,
            staff_position=demand.staff_position,
            required_count=demand.required_count,
            assigned_users=assigned_users,
            missing_count=missing_count,
            source=demand.source,
        ).model_dump(mode="json")

        day_key = demand.date.isoformat()
        for assigned in assigned_users:
            demand_by_user_day[assigned["user_id"]][day_key].append(cell)
        if missing_count > 0:
            open_by_day[day_key].append(cell)

    rows: list[dict] = []
    for membership, user in users:
        if membership.role not in (RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF):
            continue
        days_map: dict[str, list[dict]] = {day.isoformat(): [] for day in week_days}
        for day in week_days:
            days_map[day.isoformat()] = demand_by_user_day[user.id].get(day.isoformat(), [])

        rows.append(
            PreviewCalendarRowOut(
                user_id=user.id,
                user_name=user.full_name,
                role=membership.role,
                staff_position=membership.staff_position,
                days=days_map,
            ).model_dump(mode="json")
        )

    open_complete = {day.isoformat(): open_by_day.get(day.isoformat(), []) for day in week_days}
    return SchedulePreviewCalendarOut(
        week_start=week_start,
        rows=rows,
        open_shifts_by_day=open_complete,
        summary=plan.coverage_summary,
    ).model_dump(mode="json")


def _serialize_shift_request(item: ShiftRequest, requester_name: str) -> dict:
    return ShiftRequestOut(
        id=item.id,
        shift_id=item.shift_id,
        requester_user_id=item.requester_user_id,
        requester_name=requester_name,
        request_type=item.request_type,
        status=item.status,
        requester_assignment_id=item.requester_assignment_id,
        target_assignment_id=item.target_assignment_id,
        note=item.note,
        resolved_by=item.resolved_by,
        created_at=item.created_at,
        resolved_at=item.resolved_at,
    ).model_dump(mode="json")


def _notify_manager_and_ADMIN_about_request(
    db: Session, organization_id: UUID, requester_user_id: UUID, shift_request: ShiftRequest
) -> None:
    reviewer_ids = db.scalars(
        select(OrganizationMembership.user_id).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.role.in_([RoleEnum.ADMIN, RoleEnum.MANAGER]),
            OrganizationMembership.user_id != requester_user_id,
        )
    ).all()

    for reviewer_id in reviewer_ids:
        db.add(
            InAppNotification(
                organization_id=organization_id,
                user_id=reviewer_id,
                title="New shift request",
                body=f"{shift_request.request_type.value.title()} request created for shift {shift_request.shift_id}",
            )
        )


def _ensure_request_assignment_valid(
    db: Session,
    organization_id: UUID,
    user_id: UUID,
    shift: Shift,
    exclude_assignment_ids: set[UUID] | None = None,
) -> None:
    issues = collect_assignment_validation_issues(
        db=db,
        organization_id=organization_id,
        user_id=user_id,
        shift=shift,
        exclude_assignment_ids=exclude_assignment_ids,
    )
    if issues:
        raise HTTPException(status_code=422, detail=f"Cannot approve request: {', '.join(issues)}")


def _approve_pickup_request(db: Session, organization_id: UUID, request_item: ShiftRequest) -> None:
    shift = _get_shift_or_404(db, request_item.shift_id, organization_id)

    already_assigned = db.scalar(
        select(Assignment).where(
            Assignment.shift_id == shift.id,
            Assignment.user_id == request_item.requester_user_id,
        )
    )
    if already_assigned is not None:
        raise HTTPException(status_code=422, detail="Requester is already assigned to this shift")

    assignment_count = db.scalar(select(func.count()).select_from(Assignment).where(Assignment.shift_id == shift.id)) or 0
    if assignment_count >= shift.required_count:
        raise HTTPException(status_code=422, detail="Shift has no open slots for pickup")

    _ensure_request_assignment_valid(
        db=db,
        organization_id=organization_id,
        user_id=request_item.requester_user_id,
        shift=shift,
    )
    db.add(Assignment(shift_id=shift.id, user_id=request_item.requester_user_id))


def _approve_swap_request(db: Session, organization_id: UUID, request_item: ShiftRequest) -> None:
    if request_item.requester_assignment_id is None or request_item.target_assignment_id is None:
        raise HTTPException(status_code=422, detail="Swap request requires requester and target assignments")

    requester_assignment = db.get(Assignment, request_item.requester_assignment_id)
    target_assignment = db.get(Assignment, request_item.target_assignment_id)
    if requester_assignment is None or target_assignment is None:
        raise HTTPException(status_code=422, detail="Swap assignments not found")

    if requester_assignment.user_id != request_item.requester_user_id:
        raise HTTPException(status_code=422, detail="Requester assignment is stale")
    if target_assignment.user_id == request_item.requester_user_id:
        raise HTTPException(status_code=422, detail="Target assignment already belongs to requester")
    if target_assignment.shift_id != request_item.shift_id:
        raise HTTPException(status_code=422, detail="Target assignment does not belong to requested shift")

    requester_shift = _get_shift_or_404(db, requester_assignment.shift_id, organization_id)
    target_shift = _get_shift_or_404(db, target_assignment.shift_id, organization_id)

    if requester_assignment.status != AssignmentStatusEnum.ASSIGNED or target_assignment.status != AssignmentStatusEnum.ASSIGNED:
        raise HTTPException(status_code=422, detail="Cannot swap shifts that already started")

    target_user_id = target_assignment.user_id

    _ensure_request_assignment_valid(
        db=db,
        organization_id=organization_id,
        user_id=request_item.requester_user_id,
        shift=target_shift,
        exclude_assignment_ids={requester_assignment.id},
    )
    _ensure_request_assignment_valid(
        db=db,
        organization_id=organization_id,
        user_id=target_user_id,
        shift=requester_shift,
        exclude_assignment_ids={target_assignment.id},
    )

    requester_assignment.user_id = target_user_id
    target_assignment.user_id = request_item.requester_user_id


@router.post("/templates")
def create_template(
    payload: ShiftTemplateCreate,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    location = db.scalar(
        select(Location).where(
            Location.id == payload.location_id,
            Location.organization_id == context.membership.organization_id,
        )
    )
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")

    location_access = db.scalar(
        select(LocationMembership).where(
            LocationMembership.location_id == location.id,
            LocationMembership.user_id == context.user.id,
        )
    )
    if context.membership.role == RoleEnum.MANAGER and location_access is None:
        raise HTTPException(status_code=403, detail="Manager must belong to target location")

    template = ShiftTemplate(
        organization_id=context.membership.organization_id,
        location_id=location.id,
        day_of_week=payload.day_of_week,
        template_name=payload.template_name.strip(),
        start_time=payload.start_time,
        end_time=payload.end_time,
        required_role=payload.required_role,
        staff_position=payload.staff_position.strip() if payload.staff_position else None,
        required_count=payload.required_count,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return ok(ShiftTemplateOut.model_validate(template).model_dump(mode="json"))


@router.get("/templates")
def list_templates(
    location_id: UUID | None = None,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    query = select(ShiftTemplate).where(ShiftTemplate.organization_id == context.membership.organization_id)
    if location_id is not None:
        query = query.where(ShiftTemplate.location_id == location_id)
    templates = db.scalars(
        query.order_by(
            ShiftTemplate.location_id,
            ShiftTemplate.day_of_week,
            ShiftTemplate.start_time,
            ShiftTemplate.id,
        )
    ).all()
    return ok([ShiftTemplateOut.model_validate(item).model_dump(mode="json") for item in templates])


@router.patch("/templates/{template_id}")
def patch_template(
    template_id: UUID,
    payload: ShiftTemplatePatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    template = db.get(ShiftTemplate, template_id)
    if template is None or template.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Template not found")

    if context.membership.role == RoleEnum.MANAGER:
        access = db.scalar(
            select(LocationMembership).where(
                LocationMembership.location_id == template.location_id,
                LocationMembership.user_id == context.user.id,
            )
        )
        if access is None:
            raise HTTPException(status_code=403, detail="Manager must belong to target location")

    template.day_of_week = payload.day_of_week
    template.template_name = payload.template_name.strip()
    template.start_time = payload.start_time
    template.end_time = payload.end_time
    template.required_role = payload.required_role
    template.staff_position = payload.staff_position.strip() if payload.staff_position else None
    template.required_count = payload.required_count
    template.is_active = payload.is_active
    db.commit()
    db.refresh(template)
    return ok(ShiftTemplateOut.model_validate(template).model_dump(mode="json"))


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    template = db.get(ShiftTemplate, template_id)
    if template is None or template.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Template not found")

    if context.membership.role == RoleEnum.MANAGER:
        access = db.scalar(
            select(LocationMembership).where(
                LocationMembership.location_id == template.location_id,
                LocationMembership.user_id == context.user.id,
            )
        )
        if access is None:
            raise HTTPException(status_code=403, detail="Manager must belong to target location")

    db.delete(template)
    db.commit()
    return ok({"deleted": True, "id": str(template_id)})


@router.post("/templates/suggest")
def suggest_templates(
    payload: ScheduleGenerateRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    historical_shifts = db.scalars(
        select(Shift).where(
            Shift.organization_id == context.membership.organization_id,
            Shift.date < payload.week_start,
        )
    ).all()

    grouped: dict[tuple, dict] = {}
    for shift in historical_shifts:
        key = (
            shift.location_id,
            shift.date.weekday(),
            shift.start_time,
            shift.end_time,
            shift.required_role,
        )
        bucket = grouped.setdefault(
            key,
            {
                "location_id": shift.location_id,
                "day_of_week": shift.date.weekday(),
                "start_time": shift.start_time,
                "end_time": shift.end_time,
                "required_role": shift.required_role,
                "total_required": 0,
                "count": 0,
            },
        )
        bucket["total_required"] += shift.required_count
        bucket["count"] += 1

    suggestions = []
    for item in grouped.values():
        avg_required = max(1, round(item["total_required"] / item["count"]))
        suggestions.append(
            {
                "location_id": str(item["location_id"]),
                "day_of_week": item["day_of_week"],
                "start_time": item["start_time"],
                "end_time": item["end_time"],
                "required_role": item["required_role"],
                "required_count": avg_required,
                "confidence": min(1.0, item["count"] / 4),
            }
        )

    suggestions.sort(key=lambda item: item["confidence"], reverse=True)
    return ok(suggestions)


@router.post("/generate/preview")
def generate_schedule_preview(
    payload: ScheduleGenerateRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    plan = plan_week_schedule(
        db=db,
        organization_id=context.membership.organization_id,
        week_start=payload.week_start,
        location_id=payload.location_id,
    )
    return ok(_serialize_plan(plan))


@router.get("/preview/calendar")
def get_preview_calendar(
    week_start: date,
    location_id: UUID | None = None,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    plan = plan_week_schedule(
        db=db,
        organization_id=context.membership.organization_id,
        week_start=week_start,
        location_id=location_id,
    )
    users = db.execute(
        select(OrganizationMembership, User)
        .join(User, User.id == OrganizationMembership.user_id)
        .where(OrganizationMembership.organization_id == context.membership.organization_id)
        .order_by(User.full_name, User.id)
    ).all()
    return ok(_build_preview_calendar(plan, users, week_start))


@router.post("/preview/materialize")
def materialize_generated_preview(
    payload: SchedulePreviewMaterializeRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id
    location = db.scalar(
        select(Location).where(
            Location.id == payload.location_id,
            Location.organization_id == organization_id,
        )
    )
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")

    plan = plan_week_schedule(
        db=db,
        organization_id=organization_id,
        week_start=payload.week_start,
        location_id=payload.location_id,
    )
    created = _replace_location_overrides(
        db,
        organization_id=organization_id,
        week_start=payload.week_start,
        location_id=payload.location_id,
        created_by=context.user.id,
        overrides=_build_materialized_preview_overrides(
            plan=plan,
            week_start=payload.week_start,
            location_id=payload.location_id,
            created_by=context.user.id,
        ),
    )
    return ok([_serialize_override(item) for item in created])


@router.get("/overrides")
def list_weekly_overrides(
    week_start: date,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    items = db.scalars(
        select(ScheduleWeeklyOverride)
        .where(
            ScheduleWeeklyOverride.organization_id == context.membership.organization_id,
            ScheduleWeeklyOverride.week_start == week_start,
        )
        .order_by(
            ScheduleWeeklyOverride.day_of_week,
            ScheduleWeeklyOverride.start_time,
            ScheduleWeeklyOverride.location_id,
            ScheduleWeeklyOverride.id,
        )
    ).all()
    return ok([_serialize_override(item) for item in items])


@router.put("/overrides")
def put_weekly_overrides(
    payload: WeeklyShiftOverrideBulkIn,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id
    db.execute(
        delete(ScheduleWeeklyOverride).where(
            ScheduleWeeklyOverride.organization_id == organization_id,
            ScheduleWeeklyOverride.week_start == payload.week_start,
        )
    )
    created: list[ScheduleWeeklyOverride] = []
    for item in payload.overrides:
        override = ScheduleWeeklyOverride(
            organization_id=organization_id,
            week_start=payload.week_start,
            source_template_id=item.source_template_id,
            location_id=item.location_id,
            day_of_week=item.day_of_week,
            start_time=item.start_time,
            end_time=item.end_time,
            required_role=item.required_role,
            staff_position=item.staff_position.strip() if item.staff_position else None,
            required_count=item.required_count,
            is_deleted=item.is_deleted,
            assigned_user_id=None if item.is_deleted else item.assigned_user_id,
            created_by=context.user.id,
        )
        db.add(override)
        created.append(override)
    db.commit()
    return ok([_serialize_override(item) for item in created])


@router.post("/preview/freeze-applied")
def freeze_applied_week_into_preview(
    payload: ScheduleGenerateRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    if payload.location_id is None:
        raise HTTPException(status_code=422, detail="location_id is required")

    organization_id = context.membership.organization_id
    week_end = payload.week_start + timedelta(days=6)

    location = db.scalar(
        select(Location).where(
            Location.id == payload.location_id,
            Location.organization_id == organization_id,
        )
    )
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")

    shifts = db.scalars(
        select(Shift)
        .where(
            Shift.organization_id == organization_id,
            Shift.location_id == payload.location_id,
            Shift.date >= payload.week_start,
            Shift.date <= week_end,
        )
        .order_by(Shift.date, Shift.start_time, Shift.id)
    ).all()
    shift_ids = [item.id for item in shifts]
    assignments = db.scalars(select(Assignment).where(Assignment.shift_id.in_(shift_ids))).all() if shift_ids else []

    assignments_by_shift: dict[UUID, list[Assignment]] = defaultdict(list)
    for assignment in assignments:
        assignments_by_shift[assignment.shift_id].append(assignment)

    created_drafts: list[ScheduleWeeklyOverride] = []
    for shift in shifts:
        shift_assignments = assignments_by_shift.get(shift.id, [])
        for assignment in shift_assignments:
            created_drafts.append(
                ScheduleWeeklyOverride(
                organization_id=UUID(int=0),
                week_start=payload.week_start,
                source_template_id=None,
                location_id=shift.location_id,
                day_of_week=shift.date.weekday(),
                start_time=shift.start_time,
                end_time=shift.end_time,
                required_role=shift.required_role,
                staff_position=shift.staff_position,
                required_count=1,
                is_deleted=False,
                assigned_user_id=assignment.user_id,
                created_by=context.user.id,
            ))

        missing_count = max(0, shift.required_count - len(shift_assignments))
        for _ in range(missing_count):
            created_drafts.append(
                ScheduleWeeklyOverride(
                organization_id=UUID(int=0),
                week_start=payload.week_start,
                source_template_id=None,
                location_id=shift.location_id,
                day_of_week=shift.date.weekday(),
                start_time=shift.start_time,
                end_time=shift.end_time,
                required_role=shift.required_role,
                staff_position=shift.staff_position,
                required_count=1,
                is_deleted=False,
                assigned_user_id=None,
                created_by=context.user.id,
            ))

    created = _replace_location_overrides(
        db,
        organization_id=organization_id,
        week_start=payload.week_start,
        location_id=payload.location_id,
        created_by=context.user.id,
        overrides=created_drafts,
    )
    return ok([_serialize_override(item) for item in created])


@router.patch("/preview/edits")
def patch_preview_edit(
    payload: SchedulePreviewEditPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id
    if payload.action == "create":
        if payload.location_id is None:
            raise HTTPException(status_code=422, detail="location_id is required for create")
        if payload.day_of_week is None:
            raise HTTPException(status_code=422, detail="day_of_week is required for create")
        if payload.start_time is None or payload.end_time is None:
            raise HTTPException(status_code=422, detail="start_time and end_time are required for create")
        if payload.required_role is None:
            raise HTTPException(status_code=422, detail="required_role is required for create")
        if payload.end_time <= payload.start_time:
            raise HTTPException(status_code=422, detail="end_time must be later than start_time")

        required_count = payload.required_count or 1
        if required_count <= 0:
            raise HTTPException(status_code=422, detail="required_count must be greater than zero")

        staff_position = payload.staff_position.strip() if payload.staff_position else None
        if payload.required_role == RoleEnum.STAFF and not staff_position:
            raise HTTPException(status_code=422, detail="staff_position is required for STAFF role")
        if payload.required_role != RoleEnum.STAFF:
            staff_position = None

        target = ScheduleWeeklyOverride(
            organization_id=organization_id,
            week_start=payload.week_start,
            source_template_id=None,
            location_id=payload.location_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            end_time=payload.end_time,
            required_role=payload.required_role,
            staff_position=staff_position,
            required_count=required_count,
            is_deleted=False,
            assigned_user_id=payload.assigned_user_id,
            created_by=context.user.id,
        )
        db.add(target)
        db.flush()
        if (
            target.assigned_user_id is not None
            and preview_assignment_has_overlap(
                db=db,
                organization_id=organization_id,
                week_start=payload.week_start,
                location_id=target.location_id,
                user_id=target.assigned_user_id,
                shift_date=payload.week_start + timedelta(days=target.day_of_week),
                start_time=target.start_time,
                end_time=target.end_time,
                exclude_override_ids={target.id},
            )
        ):
            raise HTTPException(status_code=422, detail="Assignment overlap is not allowed")
        db.commit()
        db.refresh(target)
        return ok(_serialize_override(target))

    if not payload.shift_key:
        raise HTTPException(status_code=422, detail="shift_key is required")

    parts = payload.shift_key.split(":")
    target: ScheduleWeeklyOverride | None = None
    if payload.shift_key.startswith("override:") and len(parts) >= 2:
        override_id = parts[1]
        try:
            override_uuid = UUID(override_id)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Invalid override shift_key") from exc
        target = db.get(ScheduleWeeklyOverride, override_uuid)
        if target is None or target.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Override not found")
    else:
        if len(parts) < 2:
            raise HTTPException(status_code=422, detail="Invalid shift_key format")
        template_id_raw, shift_date_raw = parts[0], parts[1]
        try:
            template_id = UUID(template_id_raw)
            shift_date = date.fromisoformat(shift_date_raw)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="Invalid shift_key payload") from exc

        template = db.get(ShiftTemplate, template_id)
        if template is None or template.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Template not found")
        target = db.scalar(
            select(ScheduleWeeklyOverride).where(
                ScheduleWeeklyOverride.organization_id == organization_id,
                ScheduleWeeklyOverride.week_start == payload.week_start,
                ScheduleWeeklyOverride.source_template_id == template.id,
            )
        )
        if target is None:
            target = ScheduleWeeklyOverride(
                organization_id=organization_id,
                week_start=payload.week_start,
                source_template_id=template.id,
                location_id=template.location_id,
                day_of_week=shift_date.weekday(),
                start_time=template.start_time,
                end_time=template.end_time,
                required_role=template.required_role,
                staff_position=template.staff_position,
                required_count=template.required_count,
                is_deleted=False,
                created_by=context.user.id,
            )
            db.add(target)

    target.week_start = payload.week_start
    target.created_by = context.user.id

    if payload.action == "delete":
        target.is_deleted = True
        target.required_count = 0
        target.assigned_user_id = None
        db.commit()
        db.refresh(target)
        return ok(_serialize_override(target))

    target.is_deleted = False
    if payload.location_id is not None:
        target.location_id = payload.location_id
    if payload.day_of_week is not None:
        target.day_of_week = payload.day_of_week
    if payload.start_time is not None:
        target.start_time = payload.start_time
    if payload.end_time is not None:
        target.end_time = payload.end_time
    if target.end_time <= target.start_time:
        raise HTTPException(status_code=422, detail="end_time must be later than start_time")

    if payload.required_role is not None:
        target.required_role = payload.required_role
        if payload.required_role != RoleEnum.STAFF:
            target.staff_position = None
    if payload.staff_position is not None:
        target.staff_position = payload.staff_position.strip()
    if target.required_role == RoleEnum.STAFF and (target.staff_position is None or not target.staff_position.strip()):
        raise HTTPException(status_code=422, detail="staff_position is required for STAFF role")
    if target.required_role != RoleEnum.STAFF:
        target.staff_position = None

    if payload.required_count is not None:
        target.required_count = payload.required_count
    if target.required_count <= 0:
        raise HTTPException(status_code=422, detail="required_count must be greater than zero")

    if "assigned_user_id" in payload.model_fields_set:
        target.assigned_user_id = payload.assigned_user_id

    db.flush()
    if (
        target.assigned_user_id is not None
        and preview_assignment_has_overlap(
            db=db,
            organization_id=organization_id,
            week_start=payload.week_start,
            location_id=target.location_id,
            user_id=target.assigned_user_id,
            shift_date=payload.week_start + timedelta(days=target.day_of_week),
            start_time=target.start_time,
            end_time=target.end_time,
            exclude_override_ids={target.id},
        )
    ):
        raise HTTPException(status_code=422, detail="Assignment overlap is not allowed")

    db.commit()
    db.refresh(target)
    return ok(_serialize_override(target))


@router.post("/generate/apply")
def generate_schedule_apply(
    payload: ScheduleGenerateRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    plan = apply_week_schedule(
        db=db,
        organization_id=context.membership.organization_id,
        week_start=payload.week_start,
        actor_user_id=context.user.id,
        location_id=payload.location_id,
    )
    return ok(_serialize_plan(plan))


@router.post("/generate")
def generate_schedule(
    payload: ScheduleGenerateRequest,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    plan = plan_week_schedule(
        db=db,
        organization_id=context.membership.organization_id,
        week_start=payload.week_start,
        location_id=payload.location_id,
    )
    return ok(
        {
            "created_shifts": plan.created_shifts,
            "created_assignments": plan.created_assignments,
            "warnings": plan.warnings,
        }
    )


@router.get("/shifts")
def list_shifts(
    week_start: date,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    week_end = week_start + timedelta(days=6)
    shifts = db.scalars(
        select(Shift)
        .where(
            Shift.organization_id == context.membership.organization_id,
            Shift.date >= week_start,
            Shift.date <= week_end,
        )
        .order_by(Shift.date, Shift.start_time)
    ).all()

    shift_ids = [item.id for item in shifts]
    assignments = db.scalars(select(Assignment).where(Assignment.shift_id.in_(shift_ids))).all() if shift_ids else []

    grouped_assignments: dict[UUID, list[Assignment]] = defaultdict(list)
    for assignment in assignments:
        grouped_assignments[assignment.shift_id].append(assignment)

    data = [
        ShiftOut(
            id=shift.id,
            location_id=shift.location_id,
            date=shift.date,
            start_time=shift.start_time,
            end_time=shift.end_time,
            required_role=shift.required_role,
            staff_position=shift.staff_position,
            required_count=shift.required_count,
            source=shift.source,
            assignments=grouped_assignments.get(shift.id, []),
        ).model_dump(mode="json")
        for shift in shifts
    ]

    return ok(data)


@router.get("/shifts/staff")
def list_staff_calendar(
    week_start: date,
    scope: Literal["my", "team"] = "my",
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    week_end = week_start + timedelta(days=6)
    shifts = db.scalars(
        select(Shift)
        .where(
            Shift.organization_id == context.membership.organization_id,
            Shift.date >= week_start,
            Shift.date <= week_end,
        )
        .order_by(Shift.date, Shift.start_time)
    ).all()

    shift_ids = [item.id for item in shifts]
    assignments = db.scalars(select(Assignment).where(Assignment.shift_id.in_(shift_ids))).all() if shift_ids else []

    assignments_by_shift: dict[UUID, list[Assignment]] = defaultdict(list)
    assignment_user_ids: set[UUID] = set()
    for assignment in assignments:
        assignments_by_shift[assignment.shift_id].append(assignment)
        assignment_user_ids.add(assignment.user_id)

    users = db.scalars(select(User).where(User.id.in_(assignment_user_ids))).all() if assignment_user_ids else []
    user_name_by_id = {user.id: user.full_name for user in users}

    locations = db.scalars(
        select(Location).where(Location.organization_id == context.membership.organization_id)
    ).all()
    location_name_by_id = {location.id: location.name for location in locations}

    days = [
        {"date": current_date, "day_of_week": current_date.weekday(), "shifts": []}
        for current_date in (week_start + timedelta(days=index) for index in range(7))
    ]
    day_index_by_date = {day["date"]: index for index, day in enumerate(days)}

    for shift in shifts:
        shift_assignments = assignments_by_shift.get(shift.id, [])
        is_mine = any(item.user_id == context.user.id for item in shift_assignments)
        if scope == "my" and not is_mine:
            continue

        card = {
            "shift_id": shift.id,
            "location_id": shift.location_id,
            "location_name": location_name_by_id.get(shift.location_id, "Location"),
            "date": shift.date,
                "start_time": shift.start_time,
                "end_time": shift.end_time,
                "required_role": shift.required_role,
                "staff_position": shift.staff_position,
                "required_count": shift.required_count,
                "assignment_count": len(shift_assignments),
                "is_mine": is_mine,
            "can_request_pickup": (
                context.membership.role == RoleEnum.STAFF
                and not is_mine
                and len(shift_assignments) < shift.required_count
            ),
            "assignments": [
                {
                    "id": assignment.id,
                    "user_id": assignment.user_id,
                    "user_name": user_name_by_id.get(assignment.user_id, "Employee"),
                    "status": assignment.status,
                }
                for assignment in shift_assignments
            ],
        }
        days[day_index_by_date[shift.date]]["shifts"].append(card)

    data = [StaffCalendarDayOut.model_validate(item).model_dump(mode="json") for item in days]
    return ok(data)


@router.patch("/assignments/{assignment_id}")
def patch_assignment(
    assignment_id: UUID,
    payload: AssignmentPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    shift = db.get(Shift, assignment.shift_id)
    if shift is None or shift.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Shift not found")

    issues = collect_assignment_validation_issues(
        db=db,
        organization_id=context.membership.organization_id,
        user_id=payload.user_id,
        shift=shift,
        exclude_assignment_ids={assignment.id},
    )
    if "overlap" in issues:
        raise HTTPException(status_code=422, detail="Assignment overlap is not allowed")

    assignment.user_id = payload.user_id
    if issues:
        assignment.override_reason = payload.override_reason or f"Auto override: {', '.join(issues)}"
        assignment.overridden_by = context.user.id
        assignment.overridden_at = datetime.now(UTC)
    else:
        assignment.override_reason = None
        assignment.overridden_by = None
        assignment.overridden_at = None

    db.commit()
    db.refresh(assignment)

    return ok(
        {
            "assignment": {
                "id": str(assignment.id),
                "shift_id": str(assignment.shift_id),
                "user_id": str(assignment.user_id),
                "status": assignment.status,
                "ended_at": assignment.ended_at,
                "override_reason": assignment.override_reason,
                "overridden_by": str(assignment.overridden_by) if assignment.overridden_by else None,
                "overridden_at": assignment.overridden_at,
            },
            "warnings": issues,
        }
    )


@router.post("/requests")
def create_shift_request(
    payload: ShiftRequestCreate,
    context: OrgContext = Depends(require_org_context(RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id
    shift = _get_shift_or_404(db, payload.shift_id, organization_id)

    if payload.request_type == ShiftRequestTypeEnum.PICKUP:
        if payload.requester_assignment_id is not None or payload.target_assignment_id is not None:
            raise HTTPException(status_code=422, detail="Pickup request does not accept assignment ids")
        already_assigned = db.scalar(
            select(Assignment).where(
                Assignment.shift_id == shift.id,
                Assignment.user_id == context.user.id,
            )
        )
        if already_assigned is not None:
            raise HTTPException(status_code=422, detail="You are already assigned to this shift")

        assignment_count = db.scalar(select(func.count()).select_from(Assignment).where(Assignment.shift_id == shift.id)) or 0
        if assignment_count >= shift.required_count:
            raise HTTPException(status_code=422, detail="Shift has no open slots")

    if payload.request_type == ShiftRequestTypeEnum.SWAP:
        if payload.requester_assignment_id is None or payload.target_assignment_id is None:
            raise HTTPException(status_code=422, detail="Swap requires requester_assignment_id and target_assignment_id")

        requester_assignment = db.get(Assignment, payload.requester_assignment_id)
        target_assignment = db.get(Assignment, payload.target_assignment_id)
        if requester_assignment is None or target_assignment is None:
            raise HTTPException(status_code=422, detail="Assignments for swap were not found")
        if requester_assignment.user_id != context.user.id:
            raise HTTPException(status_code=422, detail="Requester assignment must belong to current user")
        if target_assignment.user_id == context.user.id:
            raise HTTPException(status_code=422, detail="Target assignment must belong to another employee")
        if target_assignment.shift_id != payload.shift_id:
            raise HTTPException(status_code=422, detail="target_assignment_id must belong to selected shift")

        requester_shift = _get_shift_or_404(db, requester_assignment.shift_id, organization_id)
        _get_shift_or_404(db, target_assignment.shift_id, organization_id)
        if requester_shift.id == shift.id:
            raise HTTPException(status_code=422, detail="Swap requires two different shifts")

    duplicate_pending = db.scalar(
        select(ShiftRequest).where(
            ShiftRequest.organization_id == organization_id,
            ShiftRequest.shift_id == payload.shift_id,
            ShiftRequest.requester_user_id == context.user.id,
            ShiftRequest.request_type == payload.request_type,
            ShiftRequest.status == ShiftRequestStatusEnum.PENDING,
        )
    )
    if duplicate_pending is not None:
        raise HTTPException(status_code=422, detail="Pending request already exists for this shift")

    request_item = ShiftRequest(
        organization_id=organization_id,
        shift_id=payload.shift_id,
        requester_user_id=context.user.id,
        request_type=payload.request_type,
        status=ShiftRequestStatusEnum.PENDING,
        requester_assignment_id=payload.requester_assignment_id,
        target_assignment_id=payload.target_assignment_id,
        note=payload.note,
    )
    db.add(request_item)
    _notify_manager_and_ADMIN_about_request(
        db=db,
        organization_id=organization_id,
        requester_user_id=context.user.id,
        shift_request=request_item,
    )
    db.commit()
    db.refresh(request_item)

    return ok(_serialize_shift_request(request_item, context.user.full_name))


@router.get("/requests")
def list_shift_requests(
    scope: Literal["my", "incoming"] = "my",
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id
    if scope == "incoming" and context.membership.role not in {RoleEnum.ADMIN, RoleEnum.MANAGER}:
        raise HTTPException(status_code=403, detail="Only ADMIN/manager can view incoming requests")

    stmt = select(ShiftRequest).where(ShiftRequest.organization_id == organization_id)
    if scope == "my":
        stmt = stmt.where(ShiftRequest.requester_user_id == context.user.id)
    if scope == "incoming":
        stmt = stmt.where(ShiftRequest.status == ShiftRequestStatusEnum.PENDING)

    requests = db.scalars(stmt.order_by(ShiftRequest.created_at.desc())).all()
    requester_ids = {item.requester_user_id for item in requests}
    requesters = db.scalars(select(User).where(User.id.in_(requester_ids))).all() if requester_ids else []
    requester_name_by_id = {user.id: user.full_name for user in requesters}

    data = [_serialize_shift_request(item, requester_name_by_id.get(item.requester_user_id, "Employee")) for item in requests]
    return ok(data)


@router.patch("/requests/{request_id}")
def patch_shift_request(
    request_id: UUID,
    payload: ShiftRequestPatch,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id
    request_item = db.get(ShiftRequest, request_id)
    if request_item is None or request_item.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Shift request not found")

    if request_item.status != ShiftRequestStatusEnum.PENDING:
        raise HTTPException(status_code=422, detail="Only pending request can be updated")

    now = datetime.now(UTC)

    if payload.action == "cancel":
        if request_item.requester_user_id != context.user.id:
            raise HTTPException(status_code=403, detail="Only requester can cancel request")
        request_item.status = ShiftRequestStatusEnum.CANCELLED
        request_item.resolved_by = context.user.id
        request_item.resolved_at = now
    elif payload.action in {"approve", "reject"}:
        if context.membership.role not in {RoleEnum.ADMIN, RoleEnum.MANAGER}:
            raise HTTPException(status_code=403, detail="Only ADMIN/manager can review requests")

        if payload.action == "approve":
            if request_item.request_type == ShiftRequestTypeEnum.PICKUP:
                _approve_pickup_request(db, organization_id, request_item)
            else:
                _approve_swap_request(db, organization_id, request_item)
            request_item.status = ShiftRequestStatusEnum.APPROVED
        else:
            request_item.status = ShiftRequestStatusEnum.REJECTED

        request_item.resolved_by = context.user.id
        request_item.resolved_at = now
        db.add(
            InAppNotification(
                organization_id=organization_id,
                user_id=request_item.requester_user_id,
                title="Shift request updated",
                body=f"Your request has been {request_item.status.value}.",
            )
        )
    else:
        raise HTTPException(status_code=422, detail="Unknown action")

    db.commit()
    db.refresh(request_item)
    requester_name = db.scalar(select(User.full_name).where(User.id == request_item.requester_user_id)) or "Employee"
    return ok(_serialize_shift_request(request_item, requester_name))
