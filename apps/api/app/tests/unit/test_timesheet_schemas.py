from __future__ import annotations

from datetime import time
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas import TimesheetCreate, TimesheetReviewAction
from app.services.worktime import worked_hours


def test_timesheet_create_rejects_zero_length_entry():
    with pytest.raises(ValidationError):
        TimesheetCreate(work_date="2026-04-22", arrived_at="18:00:00", left_at="18:00:00")


def test_timesheet_create_rejects_implausibly_long_entry():
    # 09:00 -> 06:00 would be a 21h overnight entry: almost certainly swapped times.
    with pytest.raises(ValidationError):
        TimesheetCreate(work_date="2026-04-22", arrived_at="09:00:00", left_at="06:00:00")


def test_timesheet_create_accepts_overnight_shift():
    entry = TimesheetCreate(work_date="2026-04-22", arrived_at="18:00:00", left_at="02:00:00")
    assert entry.left_at.hour == 2


def test_overnight_hours_are_counted():
    assert worked_hours(time(18, 0), time(2, 0)) == Decimal("8")


def test_timesheet_create_requires_work_date_when_shift_is_missing():
    with pytest.raises(ValidationError):
        TimesheetCreate(arrived_at="09:00:00", left_at="18:00:00")


def test_timesheet_review_correct_requires_both_times():
    with pytest.raises(ValidationError):
        TimesheetReviewAction(action="correct", arrived_at="09:00:00")
