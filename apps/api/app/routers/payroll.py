from __future__ import annotations

from collections import defaultdict
import csv
import io
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_view_payroll
from app.db import get_db
from app.models import Location, LocationMembership, OrganizationMembership, RoleEnum, Shift, Timesheet, TimesheetStatusEnum, User

from app.services.worktime import worked_hours as timesheet_hours
from app.services.billing import require_feature
from app.services.labor_rules import US_OVERTIME_MULTIPLIER, US_WEEKLY_OVERTIME_HOURS, currency_for, labor_rules_for, organization_country
from app.services.positions import positions_by_user, rate_for

router = APIRouter(prefix="/payroll", tags=["payroll"])




def _build_payroll_rows(db: Session, organization_id: UUID, start_date: date, end_date: date) -> list[dict]:
    timesheets = db.scalars(
        select(Timesheet).where(
            Timesheet.organization_id == organization_id,
            Timesheet.work_date >= start_date,
            Timesheet.work_date <= end_date,
        )
    ).all()
    confirmed_timesheets = [item for item in timesheets if item.status in (TimesheetStatusEnum.APPROVED, TimesheetStatusEnum.CORRECTED)]

    all_location_memberships = db.execute(
        select(LocationMembership, Location)
        .join(Location, Location.id == LocationMembership.location_id)
        .where(Location.organization_id == organization_id)
    ).all()
    rates_by_user_location: dict[tuple[str, str], Decimal] = {}
    memberships_by_user: dict[str, list[tuple[int, Decimal, str]]] = defaultdict(list)
    for location_membership, location in all_location_memberships:
        user_key = str(location_membership.user_id)
        location_key = str(location.id)
        rate = Decimal(str(location_membership.hourly_rate_pln))
        priority = int(location_membership.priority)
        rates_by_user_location[(user_key, location_key)] = rate
        memberships_by_user[user_key].append((priority, rate, location_key))

    shift_ids = {item.shift_id for item in confirmed_timesheets if item.shift_id}
    shifts_by_id: dict[str, Shift] = {}
    if shift_ids:
        shifts = db.scalars(select(Shift).where(Shift.id.in_(shift_ids))).all()
        shifts_by_id = {str(shift.id): shift for shift in shifts}

    org_memberships = db.scalars(
        select(OrganizationMembership).where(OrganizationMembership.organization_id == organization_id)
    ).all()
    memberships_by_org_user = {str(member.user_id): member for member in org_memberships}

    user_ids = {member.user_id for member in org_memberships}
    users = db.scalars(select(User).where(User.id.in_(user_ids))).all() if user_ids else []
    users_by_id = {str(user.id): user for user in users}

    def fallback_rate_for_user(user_id: str) -> Decimal:
        candidates = memberships_by_user.get(user_id, [])
        if not candidates:
            return Decimal("0.00")
        return sorted(candidates, key=lambda item: (-item[0], -item[1], item[2]))[0][1]

    member_positions = {str(user_id): rows for user_id, rows in positions_by_user(db, organization_id).items()}
    us_rules = labor_rules_for(organization_country(db, organization_id)) == "US"
    # Straight-time hours and pay per person per workweek (Mon-Sun), for the FLSA overtime premium.
    week_totals: dict[tuple[str, date], list[Decimal]] = defaultdict(lambda: [Decimal("0"), Decimal("0")])

    payroll_acc: dict[str, dict[str, Decimal]] = {}
    for item in confirmed_timesheets:
        user_key = str(item.user_id)
        worked_hours = timesheet_hours(item.arrived_at, item.left_at, item.break_minutes)
        if worked_hours <= 0:
            continue
        default_rate = fallback_rate_for_user(user_key)
        resolved_rate = default_rate
        if item.shift_id:
            shift = shifts_by_id.get(str(item.shift_id))
            if shift:
                shift_rate = rates_by_user_location.get((user_key, str(shift.location_id)))
                if shift_rate is not None:
                    resolved_rate = shift_rate
                # A rate set for the position worked (e.g. bartender vs server) wins over the location rate.
                resolved_rate = rate_for(member_positions.get(user_key), shift.staff_position, resolved_rate)
        entry = payroll_acc.get(user_key)
        if entry is None:
            entry = {
                "approved_hours": Decimal("0.00"),
                "payroll_pln": Decimal("0.00"),
                "restricted_hours": Decimal("0.00"),
                "hourly_rate_default_pln": default_rate,
            }
            payroll_acc[user_key] = entry
        entry["approved_hours"] += worked_hours
        entry["payroll_pln"] += worked_hours * resolved_rate
        week = week_totals[(user_key, item.work_date - timedelta(days=item.work_date.weekday()))]
        week[0] += Decimal(str(worked_hours))
        week[1] += Decimal(str(worked_hours)) * resolved_rate
        if item.is_restricted_entry:
            entry["restricted_hours"] += worked_hours

    overtime_by_user: dict[str, tuple[Decimal, Decimal]] = {}
    if us_rules:
        limit = Decimal(str(US_WEEKLY_OVERTIME_HOURS))
        for (user_key, _week), (hours, pay) in week_totals.items():
            if hours <= limit:
                continue
            overtime_hours = hours - limit
            # Regular rate = straight pay / hours; overtime adds the extra half on top of straight time.
            premium = overtime_hours * (pay / hours) * Decimal(str(US_OVERTIME_MULTIPLIER - 1))
            current_hours, current_premium = overtime_by_user.get(user_key, (Decimal("0"), Decimal("0")))
            overtime_by_user[user_key] = (current_hours + overtime_hours, current_premium + premium)
            payroll_acc[user_key]["payroll_pln"] += premium

    rows: list[dict] = []
    for user_key, membership in memberships_by_org_user.items():
        user = users_by_id.get(user_key)
        if user is None:
            continue
        values = payroll_acc.get(
            user_key,
            {
                "approved_hours": Decimal("0.00"),
                "payroll_pln": Decimal("0.00"),
                "restricted_hours": Decimal("0.00"),
                "hourly_rate_default_pln": fallback_rate_for_user(user_key),
            },
        )
        approved_hours = Decimal(values["approved_hours"]).quantize(Decimal("0.01"))
        default_rate = Decimal(values["hourly_rate_default_pln"]).quantize(Decimal("0.01"))
        payroll_total = Decimal(values["payroll_pln"]).quantize(Decimal("0.01"))
        restricted_hours = Decimal(values["restricted_hours"]).quantize(Decimal("0.01"))
        row = {
            "user_id": user_key,
            "full_name": user.full_name,
            "role": membership.role.value,
            "staff_position": membership.staff_position,
            "approved_hours": str(approved_hours),
            "hourly_rate_default_pln": str(default_rate),
            "payroll_pln": str(payroll_total),
        }
        if restricted_hours > 0:
            row["restricted_hours"] = str(restricted_hours)
        overtime = overtime_by_user.get(user_key)
        if overtime:
            row["overtime_hours"] = str(overtime[0].quantize(Decimal("0.01")))
            row["overtime_premium"] = str(overtime[1].quantize(Decimal("0.01")))
        rows.append(row)

    rows.sort(key=lambda item: (-Decimal(item["payroll_pln"]), item["full_name"].lower()))
    return rows


@router.get("/summary")
def payroll_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    user_id: UUID | None = None,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.STAFF)),
    db: Session = Depends(get_db),
):
    require_feature(db, context.membership.organization_id, "payroll")
    organization = get_current_organization(context, db)

    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date - timedelta(days=6)

    target_user_id: UUID | None = user_id
    if context.membership.role == RoleEnum.STAFF:
        if user_id is not None and user_id != context.user.id:
            raise HTTPException(status_code=403, detail="Staff can only view own payroll")
        target_user_id = context.user.id
    elif context.membership.role == RoleEnum.MANAGER and not can_view_payroll(context.membership, organization):
        raise HTTPException(status_code=403, detail="Manager payroll access is disabled in this workspace")

    rows = _build_payroll_rows(db, context.membership.organization_id, start_date, end_date)
    if target_user_id is not None:
        rows = [row for row in rows if row["user_id"] == str(target_user_id)]

    total_hours = sum(Decimal(row["approved_hours"]) for row in rows) if rows else Decimal("0.00")
    total_payroll = sum(Decimal(row["payroll_pln"]) for row in rows) if rows else Decimal("0.00")

    return ok(
        {
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            "viewer_scope": "self" if context.membership.role == RoleEnum.STAFF else "team",
            "total_hours": str(total_hours.quantize(Decimal("0.01"))),
            "total_payroll_pln": str(total_payroll.quantize(Decimal("0.01"))),
            "currency": currency_for(organization_country(db, context.membership.organization_id)),
            "rows": rows,
        }
    )


def _polish_decimal(value: str) -> str:
    return value.replace(".", ",")


def _safe_cell(value: str) -> str:
    # Names are user-controlled; neutralise spreadsheet formulas (CSV injection).
    return f"'{value}" if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


@router.get("/export.csv")
def export_payroll_csv(
    start_date: date,
    end_date: date,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    """Payroll for the accountant, in the spreadsheet format of the business's country."""
    require_feature(db, context.membership.organization_id, "payroll")
    organization = get_current_organization(context, db)
    if context.membership.role == RoleEnum.MANAGER and not can_view_payroll(context.membership, organization):
        raise HTTPException(status_code=403, detail="Manager payroll access is disabled in this workspace")
    if end_date < start_date:
        raise HTTPException(status_code=422, detail="end_date must not be before start_date")

    rows = _build_payroll_rows(db, context.membership.organization_id, start_date, end_date)
    country = organization_country(db, context.membership.organization_id)
    currency = currency_for(country)
    polish = country == "PL"
    # Polish Excel expects ";" and decimal commas; US spreadsheets expect "," and decimal points.
    number = _polish_decimal if polish else (lambda value: value)
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";" if polish else ",", lineterminator="\r\n")
    if polish:
        header = ["Pracownik", "Stanowisko", "Rola", "Godziny zatwierdzone", f"Stawka {currency}/h", f"Wynagrodzenie {currency}", "Godziny poza grafikiem"]
    else:
        header = ["Employee", "Position", "Role", "Approved hours", f"Rate {currency}/h", f"Gross pay {currency}", "Unscheduled hours", "Overtime hours", f"Overtime premium {currency}"]
    writer.writerow(header)
    for row in rows:
        cells = [
            _safe_cell(row["full_name"]),
            _safe_cell(row["staff_position"] or ""),
            row["role"],
            number(row["approved_hours"]),
            number(row["hourly_rate_default_pln"]),
            number(row["payroll_pln"]),
            number(row.get("restricted_hours", "0.00")),
        ]
        if not polish:
            cells += [row.get("overtime_hours", "0.00"), row.get("overtime_premium", "0.00")]
        writer.writerow(cells)
    total_hours = sum((Decimal(row["approved_hours"]) for row in rows), Decimal("0.00"))
    total_payroll = sum((Decimal(row["payroll_pln"]) for row in rows), Decimal("0.00"))
    total_row = ["RAZEM" if polish else "TOTAL", "", "", number(f"{total_hours:.2f}"), "", number(f"{total_payroll:.2f}"), ""]
    if not polish:
        total_row += ["", ""]
    writer.writerow(total_row)

    filename = f"payroll_{start_date.isoformat()}_{end_date.isoformat()}.csv"
    # BOM so Excel detects UTF-8 and shows Polish characters correctly.
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

