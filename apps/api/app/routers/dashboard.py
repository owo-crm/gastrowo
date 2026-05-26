from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_view_full_dashboard, can_view_payroll
from app.db import get_db
from app.models import Assignment, Location, LocationMembership, OrganizationMembership, RevenueReport, RoleEnum, Shift, User
from app.models import Timesheet, TimesheetStatusEnum
from app.services.scheduler import shift_duration_hours

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def timesheet_duration_hours(arrived_at, left_at) -> Decimal:
    started = datetime.combine(date.today(), arrived_at)
    ended = datetime.combine(date.today(), left_at)
    if ended <= started:
        return Decimal("0.00")
    return Decimal(str((ended - started).total_seconds() / 3600))


@router.get("/owner")
@router.get("/ADMIN")
def owner_dashboard(
    start_date: date | None = None,
    end_date: date | None = None,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    if not can_view_full_dashboard(context.membership, organization):
        raise HTTPException(status_code=403, detail="Manager dashboard access is disabled in this workspace")

    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date - timedelta(days=6)

    reports = db.scalars(
        select(RevenueReport).where(
            RevenueReport.organization_id == context.membership.organization_id,
            RevenueReport.report_date >= start_date,
            RevenueReport.report_date <= end_date,
        )
    ).all()

    locations = db.scalars(
        select(Location).where(Location.organization_id == context.membership.organization_id)
    ).all()
    location_names = {location.id: location.name for location in locations}
    location_names_by_str = {str(location.id): location.name for location in locations}

    by_location: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    by_day: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))

    for report in reports:
        by_location[str(report.location_id)] += Decimal(report.revenue)
        by_day[report.report_date.isoformat()] += Decimal(report.revenue)

    assignment_rows = db.execute(
        select(Assignment, Shift, LocationMembership)
        .join(Shift, Shift.id == Assignment.shift_id)
        .join(
            LocationMembership,
            (LocationMembership.location_id == Shift.location_id) & (LocationMembership.user_id == Assignment.user_id),
        )
        .where(
            Shift.organization_id == context.membership.organization_id,
            Shift.date >= start_date,
            Shift.date <= end_date,
        )
    ).all()

    labor_by_day: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    labor_by_location: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for _, shift, location_membership in assignment_rows:
        cost = (Decimal(location_membership.hourly_rate_pln) * Decimal(str(shift_duration_hours(shift.start_time, shift.end_time)))).quantize(
            Decimal("0.01")
        )
        labor_by_day[shift.date.isoformat()] += cost
        labor_by_location[str(shift.location_id)] += cost

    totals_by_location = [
        {
            "location_id": location_id,
            "location_name": location_names_by_str.get(location_id, "Unknown"),
            "revenue": str(total.quantize(Decimal("0.01"))),
        }
        for location_id, total in by_location.items()
    ]
    totals_by_location.sort(key=lambda item: Decimal(item["revenue"]), reverse=True)

    totals_by_day = [{"date": day, "revenue": str(total.quantize(Decimal("0.01")))} for day, total in sorted(by_day.items())]

    labor_cost_by_day = [
        {"date": day, "labor_cost_pln": str(total.quantize(Decimal("0.01")))}
        for day, total in sorted(labor_by_day.items())
    ]
    labor_cost_by_location = [
        {
            "location_id": location_id,
            "location_name": location_names_by_str.get(location_id, "Unknown"),
            "labor_cost_pln": str(total.quantize(Decimal("0.01"))),
        }
        for location_id, total in sorted(labor_by_location.items())
    ]

    revenue_vs_labor = []
    current = start_date
    while current <= end_date:
        day_key = current.isoformat()
        revenue_vs_labor.append(
            {
                "date": day_key,
                "revenue": str(by_day.get(day_key, Decimal("0.00")).quantize(Decimal("0.01"))),
                "labor_cost_pln": str(labor_by_day.get(day_key, Decimal("0.00")).quantize(Decimal("0.01"))),
            }
        )
        current += timedelta(days=1)

    reports_out = [
        {
            "id": str(report.id),
            "location_id": str(report.location_id),
            "location_name": location_names.get(report.location_id, "Unknown"),
            "photo_url": report.photo_url,
            "report_date": report.report_date,
            "revenue": str(Decimal(report.revenue).quantize(Decimal("0.01"))),
            "created_at": report.created_at,
        }
        for report in reports
    ]
    photo_reports = [item for item in reports_out if item["photo_url"]]

    timesheets = db.scalars(
        select(Timesheet).where(
            Timesheet.organization_id == context.membership.organization_id,
            Timesheet.work_date >= start_date,
            Timesheet.work_date <= end_date,
        )
    ).all()
    pending_timesheets_count = sum(1 for item in timesheets if item.status == TimesheetStatusEnum.PENDING)
    approved_worked_hours = Decimal("0.00")
    confirmed_timesheets = []
    for item in timesheets:
        if item.status not in (TimesheetStatusEnum.APPROVED, TimesheetStatusEnum.CORRECTED):
            continue
        worked_hours = timesheet_duration_hours(item.arrived_at, item.left_at)
        if worked_hours > 0:
            approved_worked_hours += worked_hours
            confirmed_timesheets.append(item)

    all_location_memberships = db.execute(
        select(LocationMembership, Location)
        .join(Location, Location.id == LocationMembership.location_id)
        .where(Location.organization_id == context.membership.organization_id)
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

    confirmed_user_ids = {item.user_id for item in confirmed_timesheets}
    users_by_id: dict[str, User] = {}
    memberships_by_org_user: dict[str, OrganizationMembership] = {}
    if confirmed_user_ids:
        users = db.scalars(select(User).where(User.id.in_(confirmed_user_ids))).all()
        users_by_id = {str(user.id): user for user in users}
        org_memberships = db.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == context.membership.organization_id,
                OrganizationMembership.user_id.in_(confirmed_user_ids),
            )
        ).all()
        memberships_by_org_user = {str(member.user_id): member for member in org_memberships}

    def fallback_rate_for_user(user_id: str) -> Decimal:
        candidates = memberships_by_user.get(user_id, [])
        if not candidates:
            return Decimal("0.00")
        top_priority, top_rate, _ = sorted(candidates, key=lambda item: (-item[0], -item[1], item[2]))[0]
        _ = top_priority
        return top_rate

    payroll_acc: dict[str, dict[str, Decimal | str]] = {}
    for item in confirmed_timesheets:
        user_key = str(item.user_id)
        worked_hours = timesheet_duration_hours(item.arrived_at, item.left_at)
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
        entry = payroll_acc.get(user_key)
        if entry is None:
            entry = {
                "approved_hours": Decimal("0.00"),
                "payroll_pln": Decimal("0.00"),
                "restricted_hours": Decimal("0.00"),
                "hourly_rate_default_pln": default_rate,
            }
            payroll_acc[user_key] = entry
        entry["approved_hours"] = Decimal(entry["approved_hours"]) + worked_hours
        entry["payroll_pln"] = Decimal(entry["payroll_pln"]) + (worked_hours * resolved_rate)
        if item.is_restricted_entry:
            entry["restricted_hours"] = Decimal(entry["restricted_hours"]) + worked_hours

    employee_payroll = []
    for user_key, values in payroll_acc.items():
        user = users_by_id.get(user_key)
        org_membership = memberships_by_org_user.get(user_key)
        if user is None or org_membership is None:
            continue
        approved_hours = Decimal(values["approved_hours"]).quantize(Decimal("0.01"))
        default_rate = Decimal(values["hourly_rate_default_pln"]).quantize(Decimal("0.01"))
        payroll_total = Decimal(values["payroll_pln"]).quantize(Decimal("0.01"))
        restricted_hours = Decimal(values["restricted_hours"]).quantize(Decimal("0.01"))
        row = {
            "user_id": user_key,
            "full_name": user.full_name,
            "role": org_membership.role.value,
            "staff_position": org_membership.staff_position,
            "approved_hours": str(approved_hours),
            "hourly_rate_default_pln": str(default_rate),
            "payroll_pln": str(payroll_total),
        }
        if restricted_hours > 0:
            row["restricted_hours"] = str(restricted_hours)
        employee_payroll.append(row)

    employee_payroll.sort(key=lambda item: (-Decimal(item["payroll_pln"]), item["full_name"].lower()))
    payroll_visible_rows = employee_payroll if can_view_payroll(context.membership, organization) else []

    response = {
        "totals_by_location": totals_by_location,
        "totals_by_day": totals_by_day,
        "labor_cost_by_day": labor_cost_by_day,
        "labor_cost_by_location": labor_cost_by_location,
        "revenue_vs_labor": revenue_vs_labor,
        "reports": reports_out,
        "photo_reports": photo_reports,
        "timesheets_summary": {
            "pending_count": pending_timesheets_count,
            "approved_worked_hours": str(approved_worked_hours.quantize(Decimal("0.01"))),
        },
        "employee_payroll": payroll_visible_rows,
    }
    return ok(response)
