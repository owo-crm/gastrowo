from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

# Longest believable single timesheet entry; anything above is almost certainly a typo.
MAX_TIMESHEET_HOURS = 16


def worked_hours(arrived_at: time, left_at: time) -> Decimal:
    """Hours between arrival and leaving; leaving earlier than arrival means after midnight."""
    started = datetime.combine(date.today(), arrived_at)
    ended = datetime.combine(date.today(), left_at)
    if ended <= started:
        ended += timedelta(days=1)
    return Decimal(str((ended - started).total_seconds() / 3600))


def validate_timesheet_times(arrived_at: time, left_at: time) -> None:
    if left_at == arrived_at:
        raise ValueError("left_at must differ from arrived_at")
    if worked_hours(arrived_at, left_at) > MAX_TIMESHEET_HOURS:
        raise ValueError(f"Reported time is longer than {MAX_TIMESHEET_HOURS}h, check arrival and leaving times")
