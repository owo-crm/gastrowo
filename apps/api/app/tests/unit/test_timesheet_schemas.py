from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import TimesheetCreate, TimesheetReviewAction


def test_timesheet_create_requires_left_after_arrived():
    with pytest.raises(ValidationError):
        TimesheetCreate(work_date="2026-04-22", arrived_at="18:00:00", left_at="09:00:00")


def test_timesheet_create_requires_work_date_when_shift_is_missing():
    with pytest.raises(ValidationError):
        TimesheetCreate(arrived_at="09:00:00", left_at="18:00:00")


def test_timesheet_review_correct_requires_both_times():
    with pytest.raises(ValidationError):
        TimesheetReviewAction(action="correct", arrived_at="09:00:00")
