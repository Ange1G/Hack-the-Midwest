"""Pure schedule matching. `dayOfWeek` is JavaScript's Date.getDay() (0 = Sunday)."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol
from zoneinfo import ZoneInfo


class ScheduleLike(Protocol):
    month: int | None
    day_of_week: list[int]
    time_of_day: list[int]


def current_slot(local_now: datetime) -> str:
    minute = local_now.hour * 60 + local_now.minute
    return f"{local_now.date().isoformat()}:{minute:04d}"


def matching_slot(
    schedule: ScheduleLike,
    now: datetime,
    timezone_name: str,
) -> str | None:
    """Return the dedupe slot key if `now` is a scheduled minute, else None.

    Empty `timeOfDay` means the resource is not scheduled. Empty `dayOfWeek` means
    every day. `month` None means every month. Times are interpreted in
    `timezone_name` (MVP default UTC).
    """
    if not schedule.time_of_day:
        return None
    tz = ZoneInfo(timezone_name)
    local = now.astimezone(tz)
    if schedule.month is not None and local.month != schedule.month:
        return None
    js_weekday = (local.weekday() + 1) % 7
    if schedule.day_of_week and js_weekday not in schedule.day_of_week:
        return None
    minute = local.hour * 60 + local.minute
    if minute not in schedule.time_of_day:
        return None
    return current_slot(local)
