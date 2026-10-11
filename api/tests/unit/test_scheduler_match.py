from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.domains.agents.configurations import AgentConfigurations
from app.scheduler.match import current_slot, matching_slot


def _cfg(**overrides: object) -> AgentConfigurations:
    data = {"timeOfDay": [540], **overrides}
    return AgentConfigurations.model_validate(data)


def test_monday_0900_utc_matches_time_and_weekday() -> None:
    now = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)  # Monday
    slot = matching_slot(_cfg(dayOfWeek=[1]), now, "UTC")
    assert slot == "2026-10-12:0540"


def test_same_clock_in_other_timezone_uses_local_minute() -> None:
    now = datetime(2026, 10, 12, 14, 0, tzinfo=UTC)  # 09:00 America/Chicago (CDT)
    slot = matching_slot(_cfg(), now, "America/Chicago")
    assert slot == "2026-10-12:0540"


def test_empty_time_of_day_never_matches() -> None:
    now = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)
    assert matching_slot(AgentConfigurations(), now, "UTC") is None
    assert matching_slot(_cfg(timeOfDay=[]), now, "UTC") is None


def test_weekday_mismatch_does_not_match() -> None:
    now = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)  # Monday = 1
    assert matching_slot(_cfg(dayOfWeek=[0]), now, "UTC") is None


def test_month_filter() -> None:
    now = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)
    assert matching_slot(_cfg(month=10), now, "UTC") == "2026-10-12:0540"
    assert matching_slot(_cfg(month=11), now, "UTC") is None


def test_empty_day_of_week_means_every_day() -> None:
    sunday = datetime(2026, 10, 11, 9, 0, tzinfo=UTC)
    assert matching_slot(_cfg(), sunday, "UTC") == "2026-10-11:0540"


def test_current_slot_is_date_and_minute() -> None:
    now = datetime(2026, 10, 12, 9, 0, 45, tzinfo=ZoneInfo("UTC"))
    assert current_slot(now) == "2026-10-12:0540"
