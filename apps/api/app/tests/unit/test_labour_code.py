from __future__ import annotations

from datetime import date, time

from app.services.scheduler import labour_code_rest_issues

MONDAY = date(2026, 9, 28)


def day(offset: int) -> date:
    return date.fromordinal(MONDAY.toordinal() + offset)


def test_closing_then_opening_shift_breaks_daily_rest():
    # 16:00-24:00 then 08:00 next morning leaves only 8h of rest.
    issues = labour_code_rest_issues([(day(0), time(16), time(0))], (day(1), time(8), time(16)))
    assert "daily_rest_violation" in issues


def test_eleven_hours_between_shifts_is_allowed():
    issues = labour_code_rest_issues([(day(0), time(10), time(21))], (day(1), time(8), time(16)))
    assert "daily_rest_violation" not in issues


def test_split_shift_in_one_day_keeps_daily_rest():
    # Lunch + dinner service: the break until next day's lunch is still 12h.
    issues = labour_code_rest_issues([(day(0), time(10), time(14))], (day(0), time(18), time(22)))
    assert issues == []


def test_seven_days_in_a_row_break_weekly_rest():
    existing = [(day(offset), time(10), time(18)) for offset in range(6)]
    issues = labour_code_rest_issues(existing, (day(6), time(10), time(18)))
    assert "weekly_rest_violation" in issues


def test_one_free_day_with_long_nights_keeps_weekly_rest():
    # Saturday off: Friday 18:00 -> Sunday 10:00 is 40h of rest.
    existing = [(day(offset), time(10), time(18)) for offset in range(5)]
    issues = labour_code_rest_issues(existing, (day(6), time(10), time(18)))
    assert "weekly_rest_violation" not in issues
