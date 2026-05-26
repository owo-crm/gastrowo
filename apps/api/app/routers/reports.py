from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, get_current_organization, require_org_context
from app.core.envelope import ok
from app.core.permissions import can_delete_revenue_reports, can_submit_revenue_reports
from app.db import get_db
from app.models import Location, RevenueReport, RoleEnum
from app.schemas import RevenueReportCreate
from app.services.notifications import notify_admins_and_managers

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/revenue")
def create_revenue_report(
    payload: RevenueReportCreate,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    if not can_submit_revenue_reports(context.membership, organization):
        raise HTTPException(status_code=403, detail="Staff revenue reports are disabled in this workspace")

    location = db.scalar(
        select(Location).where(
            Location.id == payload.location_id,
            Location.organization_id == context.membership.organization_id,
        )
    )
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")

    report = RevenueReport(
        organization_id=context.membership.organization_id,
        location_id=payload.location_id,
        report_date=payload.report_date,
        revenue=payload.revenue,
        currency=payload.currency,
        photo_url=payload.photo_url,
        created_by=context.user.id,
    )
    db.add(report)
    notify_admins_and_managers(
        db,
        context.membership.organization_id,
        "Revenue report saved",
        f"{location.name} - {payload.revenue} {payload.currency} - {payload.report_date.isoformat()}",
    )
    db.commit()
    db.refresh(report)

    return ok(
        {
            "id": str(report.id),
            "location_id": str(report.location_id),
            "report_date": report.report_date,
            "revenue": str(report.revenue),
            "currency": report.currency,
            "photo_url": report.photo_url,
        }
    )


@router.get("/revenue")
def list_revenue_reports(
    start_date: date,
    end_date: date,
    location_id: UUID | None = None,
    context: OrgContext = Depends(require_org_context(RoleEnum.ADMIN, RoleEnum.MANAGER)),
    db: Session = Depends(get_db),
):
    query = select(RevenueReport).where(
        RevenueReport.organization_id == context.membership.organization_id,
        RevenueReport.report_date >= start_date,
        RevenueReport.report_date <= end_date,
    )
    if location_id is not None:
        query = query.where(RevenueReport.location_id == location_id)

    reports = db.scalars(query.order_by(RevenueReport.report_date.desc())).all()
    data = [
        {
            "id": str(report.id),
            "location_id": str(report.location_id),
            "report_date": report.report_date,
            "revenue": str(report.revenue),
            "currency": report.currency,
            "photo_url": report.photo_url,
        }
        for report in reports
    ]

    return ok(data)


@router.delete("/revenue/{report_id}")
def delete_revenue_report(
    report_id: UUID,
    context: OrgContext = Depends(require_org_context()),
    db: Session = Depends(get_db),
):
    organization = get_current_organization(context, db)
    if not can_delete_revenue_reports(context.membership, organization):
        raise HTTPException(status_code=403, detail="Revenue report deletion is disabled in this workspace")

    report = db.scalar(
        select(RevenueReport).where(
            RevenueReport.id == report_id,
            RevenueReport.organization_id == context.membership.organization_id,
        )
    )
    if report is None:
        raise HTTPException(status_code=404, detail="Revenue report not found")
    if context.membership.role == RoleEnum.STAFF and report.created_by != context.user.id:
        raise HTTPException(status_code=403, detail="Staff can only delete their own revenue reports")

    db.delete(report)
    db.commit()
    return ok({"deleted": True, "id": str(report_id)})
