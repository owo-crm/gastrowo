from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import Assignment, AssignmentStatusEnum, RoleEnum, Shift

router = APIRouter(prefix="/shifts", tags=["shifts"])


@router.post("/{shift_id}/start")
def start_shift(
    shift_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    shift = db.get(Shift, shift_id)
    if shift is None or shift.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Shift not found")

    assignment = db.scalar(
        select(Assignment).where(
            Assignment.shift_id == shift_id,
            Assignment.user_id == context.user.id,
        )
    )
    if assignment is None:
        raise HTTPException(status_code=403, detail="You are not assigned to this shift")

    assignment.status = AssignmentStatusEnum.IN_SHIFT
    assignment.started_at = datetime.now(UTC)
    assignment.ended_at = None


    db.commit()
    return ok(
        {
            "assignment_id": str(assignment.id),
            "status": assignment.status,
            "started_at": assignment.started_at,
        }
    )


@router.post("/{shift_id}/end")
def end_shift(
    shift_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    shift = db.get(Shift, shift_id)
    if shift is None or shift.organization_id != context.membership.organization_id:
        raise HTTPException(status_code=404, detail="Shift not found")

    assignment = db.scalar(
        select(Assignment).where(
            Assignment.shift_id == shift_id,
            Assignment.user_id == context.user.id,
        )
    )
    if assignment is None:
        raise HTTPException(status_code=403, detail="You are not assigned to this shift")

    if assignment.started_at is None:
        raise HTTPException(status_code=422, detail="Shift must be started before it can be ended")

    assignment.status = AssignmentStatusEnum.COMPLETED
    assignment.ended_at = datetime.now(UTC)


    db.commit()
    return ok(
        {
            "assignment_id": str(assignment.id),
            "status": assignment.status,
            "ended_at": assignment.ended_at,
        }
    )
