from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import Assignment, RoleEnum, Shift, Timesheet, TimesheetStatusEnum
from app.schemas import TimesheetCreate, TimesheetEntry, TimesheetReviewAction
from app.services.notifications import notify_admins_and_managers, notify_users

router = APIRouter(prefix="/timesheets", tags=["timesheets"])


def _serialize_timesheet(item: Timesheet) -> dict:
    return TimesheetEntry.model_validate(item).model_dump(mode="json")


def _minutes_between(start: time, end: time) -> int:
    start_total = start.hour * 60 + start.minute
    end_total = end.hour * 60 + end.minute
    if end_total <= start_total:
        end_total += 24 * 60
    return end_total - start_total


def _format_delta_label(delta_minutes: int) -> str:
    if delta_minutes == 0:
        return "on time vs plan"
    sign = "+" if delta_minutes > 0 else "-"
    absolute = abs(delta_minutes)
    hours = absolute // 60
    minutes = absolute % 60
    if hours and minutes:
        return f"{sign}{hours}h {minutes} min vs plan"
    if hours:
        return f"{sign}{hours}h vs plan"
    return f"{sign}{minutes} min vs plan"


@router.post("")
def create_timesheet(
    payload: TimesheetCreate,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id
    work_date = payload.work_date
    is_restricted = payload.shift_id is None

    if payload.shift_id is not None:
        shift = db.get(Shift, payload.shift_id)
        if shift is None or shift.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Shift not found")

        assigned = db.scalar(
            select(Assignment).where(
                Assignment.shift_id == shift.id,
                Assignment.user_id == context.user.id,
            )
        )
        if assigned is None:
            raise HTTPException(status_code=403, detail="You can submit timesheet only for your assigned shifts")

        work_date = shift.date

        existing = db.scalar(
            select(Timesheet).where(
                Timesheet.organization_id == organization_id,
                Timesheet.user_id == context.user.id,
                Timesheet.shift_id == shift.id,
                Timesheet.status.in_([
                    TimesheetStatusEnum.PENDING,
                    TimesheetStatusEnum.APPROVED,
                    TimesheetStatusEnum.CORRECTED,
                ]),
            )
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Timesheet for this shift already exists")
    else:
        if work_date is None:
            raise HTTPException(status_code=422, detail="work_date is required for restricted day entry")

        existing = db.scalar(
            select(Timesheet).where(
                Timesheet.organization_id == organization_id,
                Timesheet.user_id == context.user.id,
                Timesheet.shift_id.is_(None),
                Timesheet.work_date == work_date,
                Timesheet.status.in_([
                    TimesheetStatusEnum.PENDING,
                    TimesheetStatusEnum.APPROVED,
                    TimesheetStatusEnum.CORRECTED,
                ]),
            )
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="Restricted timesheet entry for this day already exists")

    item = Timesheet(
        organization_id=organization_id,
        user_id=context.user.id,
        shift_id=payload.shift_id,
        work_date=work_date,
        arrived_at=payload.arrived_at,
        left_at=payload.left_at,
        note=payload.note,
        is_restricted_entry=is_restricted,
        status=TimesheetStatusEnum.PENDING,
    )
    db.add(item)
    delta_text = "Extra entry"
    if payload.shift_id is not None:
        planned_minutes = _minutes_between(shift.start_time, shift.end_time)
        actual_minutes = _minutes_between(payload.arrived_at, payload.left_at)
        delta_text = _format_delta_label(actual_minutes - planned_minutes)
    notify_admins_and_managers(
        db,
        organization_id,
        "Timesheet submitted",
        f"{context.user.full_name} - {work_date.isoformat()} - {payload.arrived_at}-{payload.left_at} - {delta_text}",
    )
    db.commit()
    db.refresh(item)
    return ok(_serialize_timesheet(item))


@router.get("")
def list_timesheets(
    scope: Literal["my", "team", "pending"] = "my",
    start_date: date | None = None,
    end_date: date | None = None,
    user_id: UUID | None = None,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    if context.membership.role == RoleEnum.STAFF and scope != "my":
        raise HTTPException(status_code=403, detail="Staff can only view own timesheets")

    if scope in {"team", "pending"} and context.membership.role not in {RoleEnum.ADMIN, RoleEnum.MANAGER}:
        raise HTTPException(status_code=403, detail="Only ADMIN/manager can view team timesheets")

    query = select(Timesheet).where(Timesheet.organization_id == context.membership.organization_id)

    if scope == "my":
        query = query.where(Timesheet.user_id == context.user.id)
    elif scope == "pending":
        query = query.where(Timesheet.status == TimesheetStatusEnum.PENDING)

    if user_id is not None:
        if scope == "my" and user_id != context.user.id:
            raise HTTPException(status_code=403, detail="Cannot query another user in my scope")
        query = query.where(Timesheet.user_id == user_id)

    if start_date is not None:
        query = query.where(Timesheet.work_date >= start_date)
    if end_date is not None:
        query = query.where(Timesheet.work_date <= end_date)

    rows = db.scalars(query.order_by(Timesheet.work_date.desc(), Timesheet.created_at.desc())).all()
    return ok([_serialize_timesheet(item) for item in rows])


@router.patch("/{timesheet_id}")
def review_timesheet(
    timesheet_id: UUID,
    payload: TimesheetReviewAction,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    item = db.get(Timesheet, timesheet_id)
    if item is None or item.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Timesheet not found")

    if item.status != TimesheetStatusEnum.PENDING:
        raise HTTPException(status_code=422, detail="Only pending timesheets can be reviewed")

    now = datetime.now(UTC)

    if payload.action == "approve":
        item.status = TimesheetStatusEnum.APPROVED
    elif payload.action == "reject":
        item.status = TimesheetStatusEnum.REJECTED
    elif payload.action == "correct":
        item.status = TimesheetStatusEnum.CORRECTED
        item.arrived_at = payload.arrived_at
        item.left_at = payload.left_at
    else:
        raise HTTPException(status_code=422, detail="Unknown review action")

    item.review_note = payload.review_note
    item.reviewed_by = context.user.id
    item.reviewed_at = now
    notify_users(
        db,
        context.membership.organization_id,
        [item.user_id],
        f"Timesheet {item.status.value}",
        f"{item.work_date.isoformat()} - {item.arrived_at}-{item.left_at}",
    )
    notify_admins_and_managers(
        db,
        context.membership.organization_id,
        f"Timesheet {item.status.value}",
        f"{item.work_date.isoformat()} - {item.arrived_at}-{item.left_at}",
    )

    db.commit()
    db.refresh(item)
    return ok(_serialize_timesheet(item))

