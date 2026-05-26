from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_manage_team
from app.db import get_db
from app.models import PositionCatalog, RoleEnum, ShiftTemplate
from app.schemas import PositionCatalogCreate, PositionCatalogOut

router = APIRouter(prefix="/positions", tags=["positions"])


def _require_team_access(context: OrgContext, db: Session) -> None:
    organization = get_current_organization(context, db)
    if not can_manage_team(context.membership, organization):
        raise HTTPException(status_code=403, detail="Team management access is disabled for this account")


@router.get("")
def list_positions(
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    positions = db.scalars(
        select(PositionCatalog).where(
            PositionCatalog.organization_id == context.membership.organization_id,
            PositionCatalog.is_active.is_(True),
        ).order_by(PositionCatalog.name, PositionCatalog.id)
    ).all()
    return ok([PositionCatalogOut.model_validate(item).model_dump(mode="json") for item in positions])


@router.post("")
def create_position(
    payload: PositionCatalogCreate,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    normalized_name = payload.name.strip()
    existing = db.scalar(
        select(PositionCatalog).where(
            PositionCatalog.organization_id == context.membership.organization_id,
            PositionCatalog.name == normalized_name,
        )
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return ok(PositionCatalogOut.model_validate(existing).model_dump(mode="json"))
        raise HTTPException(status_code=409, detail="Position already exists")

    position = PositionCatalog(
        organization_id=context.membership.organization_id,
        name=normalized_name,
        is_active=True,
    )
    db.add(position)
    db.commit()
    db.refresh(position)
    return ok(PositionCatalogOut.model_validate(position).model_dump(mode="json"))


@router.delete("/{position_id}")
def delete_position(
    position_id: UUID,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    _require_team_access(context, db)
    position = db.scalar(
        select(PositionCatalog).where(
            PositionCatalog.id == position_id,
            PositionCatalog.organization_id == context.membership.organization_id,
        )
    )
    if position is None:
        raise HTTPException(status_code=404, detail="Position not found")

    used_in_templates = db.scalar(
        select(ShiftTemplate.id).where(
            ShiftTemplate.organization_id == context.membership.organization_id,
            ShiftTemplate.required_role == RoleEnum.STAFF,
            ShiftTemplate.staff_position == position.name,
            ShiftTemplate.is_active.is_(True),
        ).limit(1)
    )
    if used_in_templates:
        position.is_active = False
        db.commit()
        return ok({"deleted": True, "id": str(position_id), "mode": "soft_disabled"})

    db.delete(position)
    db.commit()
    return ok({"deleted": True, "id": str(position_id), "mode": "hard_deleted"})
