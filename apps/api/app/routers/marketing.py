from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.deps import OrgContext, require_org_context
from app.core.envelope import ok
from app.db import get_db
from app.models import MarketingWaitlistLead, RoleEnum
from app.schemas import MarketingWaitlistLeadOut, MarketingWaitlistSignupOut, MarketingWaitlistSignupRequest

router = APIRouter(prefix="/marketing", tags=["marketing"])


@router.post("/waitlist")
def join_waitlist(payload: MarketingWaitlistSignupRequest, db: Session = Depends(get_db)):
    normalized_email = payload.email.lower()
    existing = db.scalar(select(MarketingWaitlistLead).where(MarketingWaitlistLead.email == normalized_email))
    if existing is not None:
        return ok(
            MarketingWaitlistSignupOut(
                email=existing.email,
                created=False,
                created_at=existing.created_at,
            ).model_dump(mode="json")
        )

    lead = MarketingWaitlistLead(email=normalized_email)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return ok(
        MarketingWaitlistSignupOut(
            email=lead.email,
            created=True,
            created_at=lead.created_at,
        ).model_dump(mode="json")
    )


@router.get("/waitlist")
def list_waitlist_leads(_: OrgContext = Depends(require_org_context(RoleEnum.ADMIN)), db: Session = Depends(get_db)):
    leads = db.scalars(select(MarketingWaitlistLead).order_by(desc(MarketingWaitlistLead.created_at))).all()
    return ok([MarketingWaitlistLeadOut.model_validate(item).model_dump(mode="json") for item in leads])
