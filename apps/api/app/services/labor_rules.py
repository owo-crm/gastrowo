"""Labour rules by country: Kodeks pracy rest periods in Poland, the 40-hour overtime line in the US."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Location, Organization

# FLSA: hours over 40 in a workweek are paid at 1.5x.
US_WEEKLY_OVERTIME_HOURS = 40.0
US_OVERTIME_MULTIPLIER = 1.5

# Kodeks pracy art. 151 §1: work beyond the 8-hour daily norm or the 40-hour week is overtime. The 50% or
# 100% supplement depends on when it was worked and the settlement period, so payroll reports the hours only.
PL_DAILY_NORM_HOURS = 8.0
PL_WEEKLY_NORM_HOURS = 40.0
# Minimum hourly rate (minimalna stawka godzinowa) for civil contracts, PLN gross, by the year it applies from.
PL_MIN_HOURLY_RATE = {2025: 30.50, 2026: 31.40}

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


def pl_min_hourly_rate(on: date) -> float | None:
    years = [year for year in PL_MIN_HOURLY_RATE if year <= on.year]
    return PL_MIN_HOURLY_RATE[max(years)] if years else None


def pl_overtime_hours(day_hours: dict[date, float]) -> float:
    """Hours over 8 in a day plus hours over 40 in the week that are not already daily overtime."""
    daily = sum(max(0.0, hours - PL_DAILY_NORM_HOURS) for hours in day_hours.values())
    weekly = max(0.0, sum(day_hours.values()) - daily - PL_WEEKLY_NORM_HOURS)
    return daily + weekly


def default_timezone_for(country: str) -> str:
    return DEFAULT_TIMEZONE_BY_COUNTRY.get(country.upper(), "America/New_York")


def timezone_or_default(zone: str | None, country: str) -> str:
    """The zone the owner's device reported, when it is a real IANA zone; otherwise the country's default."""
    if zone and len(zone) <= 64:
        try:
            ZoneInfo(zone)
            return zone
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return default_timezone_for(country)


def local_today(db: Session, organization_id: UUID) -> date:
    """Today in the business's own time zone (its first location), not the server's UTC day."""
    zone = db.scalar(select(Location.timezone).where(Location.organization_id == organization_id).order_by(Location.name))
    try:
        return datetime.now(ZoneInfo(zone)).date() if zone else datetime.now(UTC).date()
    except (ZoneInfoNotFoundError, ValueError):
        return datetime.now(UTC).date()


def locale_settings(organization) -> dict[str, str]:
    """Country-derived settings the frontend needs to format money and apply the right rules."""
    country = (getattr(organization, "country", None) or "US").upper()
    return {"country": country, "currency": currency_for(country), "labor_rules": labor_rules_for(country)}
