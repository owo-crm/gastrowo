from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

# Longest believable single timesheet entry; anything above is almost certainly a typo.
MAX_TIMESHEET_HOURS = 16


def worked_hours(arrived_at: time, left_at: time, break_minutes: int | None = 0) -> Decimal:
    """Hours between arrival and leaving, minus the unpaid break; leaving before arrival means after midnight."""
    started = datetime.combine(date.today(), arrived_at)
    ended = datetime.combine(date.today(), left_at)
    if ended <= started:
        ended += timedelta(days=1)
    seconds = (ended - started).total_seconds() - max(break_minutes or 0, 0) * 60
    return Decimal(str(max(seconds, 0) / 3600))


def validate_timesheet_times(arrived_at: time, left_at: time) -> None:
    if left_at == arrived_at:
        raise ValueError("left_at must differ from arrived_at")
    if worked_hours(arrived_at, left_at) > MAX_TIMESHEET_HOURS:
        raise ValueError(f"Reported time is longer than {MAX_TIMESHEET_HOURS}h, check arrival and leaving times")
