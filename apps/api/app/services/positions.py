"""Positions a team member can work, and the hourly rate that applies to a given shift."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import MemberPosition, OrganizationMembership, PositionCatalog


def _key(position: str | None) -> str:
    return (position or "").strip().lower()


def positions_by_user(db: Session, organization_id: UUID) -> dict[UUID, list[MemberPosition]]:
    rows = db.scalars(select(MemberPosition).where(MemberPosition.organization_id == organization_id)).all()
    grouped: dict[UUID, list[MemberPosition]] = defaultdict(list)
    for row in rows:
        grouped[row.user_id].append(row)
    for items in grouped.values():
        items.sort(key=lambda item: (not item.is_primary, item.position.lower()))
    return grouped


def position_names(membership: OrganizationMembership, rows: list[MemberPosition] | None) -> set[str]:
    """Lower-cased positions a member can work; falls back to the legacy single position."""
    if rows:
        return {_key(row.position) for row in rows}
    return {_key(membership.staff_position)} if membership.staff_position else set()


def is_primary_position(membership: OrganizationMembership, rows: list[MemberPosition] | None, position: str | None) -> bool:
    if rows:
        return any(row.is_primary and _key(row.position) == _key(position) for row in rows)
    return _key(membership.staff_position) == _key(position)


def rate_for(rows: list[MemberPosition] | None, position: str | None, location_rate: Decimal | float | str | None) -> Decimal:
    """Position rate when the member has one for this position, otherwise their rate at the location."""
    for row in rows or []:
        if row.hourly_rate is not None and _key(row.position) == _key(position):
            return Decimal(str(row.hourly_rate))
    return Decimal(str(location_rate or 0))


def ensure_catalog(db: Session, organization_id: UUID, names: list[str]) -> None:
    """Make sure every position name exists (and is active) in the business's catalog."""
    catalog = {
        _key(item.name): item
        for item in db.scalars(select(PositionCatalog).where(PositionCatalog.organization_id == organization_id)).all()
    }
    for name in names:
        item = catalog.get(_key(name))
        if item is None:
            item = PositionCatalog(organization_id=organization_id, name=name.strip(), is_active=True)
            db.add(item)
            catalog[_key(name)] = item
        elif not item.is_active:
            item.is_active = True


def replace_member_positions(
    db: Session,
    membership: OrganizationMembership,
    items: list[tuple[str, Decimal | None, bool]],
) -> list[MemberPosition]:
    """Replace the whole set. Exactly one position ends up primary, and it is mirrored to `staff_position`."""
    cleaned: list[tuple[str, Decimal | None, bool]] = []
    seen: set[str] = set()
    for name, rate, primary in items:
        name = name.strip()
        if not name or _key(name) in seen:
            continue
        seen.add(_key(name))
        cleaned.append((name, rate, primary))
    if cleaned and not any(primary for *_rest, primary in cleaned):
        first_name, first_rate, _ = cleaned[0]
        cleaned[0] = (first_name, first_rate, True)
    primary_seen = False
    normalized: list[tuple[str, Decimal | None, bool]] = []
    for name, rate, primary in cleaned:
        is_primary = primary and not primary_seen
        primary_seen = primary_seen or is_primary
        normalized.append((name, rate, is_primary))

    db.execute(
        delete(MemberPosition).where(
            MemberPosition.organization_id == membership.organization_id,
            MemberPosition.user_id == membership.user_id,
        )
    )
    rows = [
        MemberPosition(
            organization_id=membership.organization_id,
            user_id=membership.user_id,
            position=name,
            hourly_rate=rate,
            is_primary=primary,
        )
        for name, rate, primary in normalized
    ]
    db.add_all(rows)
    ensure_catalog(db, membership.organization_id, [name for name, *_rest in normalized])
    primary_name = next((name for name, _rate, primary in normalized if primary), None)
    membership.staff_position = primary_name
    return rows
