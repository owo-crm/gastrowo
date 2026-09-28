"""Labour rules by country: Kodeks pracy rest periods in Poland, the 40-hour overtime line in the US."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Organization

# FLSA: hours over 40 in a workweek are paid at 1.5x.
US_WEEKLY_OVERTIME_HOURS = 40.0
US_OVERTIME_MULTIPLIER = 1.5

CURRENCY_BY_COUNTRY = {"US": "USD", "PL": "PLN"}
DEFAULT_TIMEZONE_BY_COUNTRY = {"US": "America/New_York", "PL": "Europe/Warsaw"}


def organization_country(db: Session, organization_id: UUID) -> str:
    organization = db.get(Organization, organization_id)
    return (organization.country if organization and organization.country else "US").upper()


def currency_for(country: str) -> str:
    return CURRENCY_BY_COUNTRY.get(country.upper(), "USD")


def labor_rules_for(country: str) -> str:
    return "PL" if country.upper() == "PL" else "US"


def weekly_overtime_issue(country: str, hours_after_shift: float) -> list[str]:
    """Auto-plan avoids overtime in the US; manual assignments get it as a warning."""
    if labor_rules_for(country) == "US" and hours_after_shift > US_WEEKLY_OVERTIME_HOURS + 1e-9:
        return ["weekly_overtime"]
    return []


def default_timezone_for(country: str) -> str:
    return DEFAULT_TIMEZONE_BY_COUNTRY.get(country.upper(), "America/New_York")


def locale_settings(organization) -> dict[str, str]:
    """Country-derived settings the frontend needs to format money and apply the right rules."""
    country = (getattr(organization, "country", None) or "US").upper()
    return {"country": country, "currency": currency_for(country), "labor_rules": labor_rules_for(country)}
