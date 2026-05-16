from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import AvailabilitySlot, AvailabilityWeek, OrganizationMembership, RoleEnum, User
from app.schemas import AvailabilitySlotOut, AvailabilityWeekOut, AvailabilityWeekUpsert, TeamAvailabilitySummaryRowOut

router = APIRouter(prefix="/availability", tags=["availability"])


def _resolve_target_user_id(context: OrgContext, requested_user_id: UUID | None) -> UUID:
    if context.membership.role == RoleEnum.STAFF:
        if requested_user_id is not None and requested_user_id != context.user.id:
            raise HTTPException(status_code=403, detail="Staff can edit only own weekly availability")
        return context.user.id
    return requested_user_id or context.user.id


def _ensure_member_exists(db: Session, organization_id: UUID, user_id: UUID) -> None:
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Organization member not found")


@router.put("/weeks/{week_start}")
def upsert_week_availability(
    week_start: date,
    payload: AvailabilityWeekUpsert,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    if payload.week_start != week_start:
        raise HTTPException(status_code=422, detail="Path week_start must match payload week_start")

    target_user_id = _resolve_target_user_id(context, payload.user_id)
    organization_id = context.membership.organization_id
    _ensure_member_exists(db, organization_id, target_user_id)

    week = db.scalar(
        select(AvailabilityWeek).where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.user_id == target_user_id,
            AvailabilityWeek.week_start == week_start,
        )
    )

    if week is not None and week.locked_at is not None:
        raise HTTPException(status_code=422, detail="Availability for this week is locked after schedule apply")

    if week is None:
        week = AvailabilityWeek(
            organization_id=organization_id,
            user_id=target_user_id,
            week_start=week_start,
            desired_hours=payload.desired_hours,
            submitted_by=context.user.id,
        )
        db.add(week)
        db.flush()
    else:
        week.desired_hours = payload.desired_hours
        week.submitted_by = context.user.id

    db.execute(delete(AvailabilitySlot).where(AvailabilitySlot.week_id == week.id))

    for slot in payload.slots:
        db.add(
            AvailabilitySlot(
                week_id=week.id,
                user_id=target_user_id,
                day_of_week=slot.day_of_week,
                start_time=slot.start_time,
                end_time=slot.end_time,
                is_available=slot.is_available,
            )
        )

    db.commit()

    slots = db.scalars(select(AvailabilitySlot).where(AvailabilitySlot.week_id == week.id)).all()
    response = AvailabilityWeekOut(
        id=week.id,
        user_id=week.user_id,
        week_start=week.week_start,
        desired_hours=week.desired_hours,
        locked_at=week.locked_at,
        locked_by=week.locked_by,
        slots=[AvailabilitySlotOut.model_validate(item) for item in slots],
    )
    return ok(response.model_dump(mode="json"))


@router.get("/weeks/{week_start}")
def get_week_availability(
    week_start: date,
    user_id: UUID | None = None,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    target_user_id = _resolve_target_user_id(context, user_id)
    organization_id = context.membership.organization_id
    _ensure_member_exists(db, organization_id, target_user_id)

    week = db.scalar(
        select(AvailabilityWeek).where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.user_id == target_user_id,
            AvailabilityWeek.week_start == week_start,
        )
    )
    if week is None:
        return ok(None)

    slots = db.scalars(select(AvailabilitySlot).where(AvailabilitySlot.week_id == week.id)).all()
    response = AvailabilityWeekOut(
        id=week.id,
        user_id=week.user_id,
        week_start=week.week_start,
        desired_hours=week.desired_hours,
        locked_at=week.locked_at,
        locked_by=week.locked_by,
        slots=[AvailabilitySlotOut.model_validate(item) for item in slots],
    )
    return ok(response.model_dump(mode="json"))


@router.get("/weeks/{week_start}/team-summary")
def get_week_team_summary(
    week_start: date,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization_id = context.membership.organization_id

    rows = db.execute(
        select(User, OrganizationMembership)
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .where(OrganizationMembership.organization_id == organization_id)
        .order_by(User.full_name, User.id)
    ).all()

    weeks = db.scalars(
        select(AvailabilityWeek).where(
            AvailabilityWeek.organization_id == organization_id,
            AvailabilityWeek.week_start == week_start,
        )
    ).all()
    week_by_user = {week.user_id: week for week in weeks}

    week_ids = [week.id for week in weeks]
    slots_by_week: dict[UUID, int] = {week_id: 0 for week_id in week_ids}
    availability_slots_by_week: dict[UUID, list[AvailabilitySlotOut]] = {week_id: [] for week_id in week_ids}
    if week_ids:
        slots = db.scalars(
            select(AvailabilitySlot).where(
                AvailabilitySlot.week_id.in_(week_ids),
            )
        ).all()
        for slot in slots:
            if slot.is_available:
                slots_by_week[slot.week_id] = slots_by_week.get(slot.week_id, 0) + 1
            availability_slots_by_week.setdefault(slot.week_id, []).append(AvailabilitySlotOut.model_validate(slot))

    summary = []
    for user, _membership in rows:
        week = week_by_user.get(user.id)
        if week is None:
            desired_hours = 0
            slots_count = 0
            status = "empty"
        else:
            desired_hours = week.desired_hours
            slots_count = slots_by_week.get(week.id, 0)
            status = "filled" if desired_hours > 0 and slots_count > 0 else "partial"

        summary.append(
            TeamAvailabilitySummaryRowOut(
                user_id=user.id,
                full_name=user.full_name,
                desired_hours=desired_hours,
                slots_count=slots_count,
                status=status,
                slots=availability_slots_by_week.get(week.id, []) if week is not None else [],
            ).model_dump(mode="json")
        )

    return ok(summary)
