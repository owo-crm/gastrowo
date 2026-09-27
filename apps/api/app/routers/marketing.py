from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.envelope import ok
from app.db import get_db
from app.models import MarketingWaitlistLead, User
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
def list_waitlist_leads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Leads are platform-wide data: restaurant admins must not see each other's prospects.
    if user.email.lower() not in settings.parsed_platform_admin_emails:
        raise HTTPException(status_code=403, detail="Platform admin access required")
    leads = db.scalars(select(MarketingWaitlistLead).order_by(desc(MarketingWaitlistLead.created_at))).all()
    return ok([MarketingWaitlistLeadOut.model_validate(item).model_dump(mode="json") for item in leads])
