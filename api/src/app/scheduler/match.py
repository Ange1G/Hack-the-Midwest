"""Pure schedule matching. `dayOfWeek` is JavaScript's Date.getDay() (0 = Sunday)."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.domains.agents.configurations import AgentConfigurations


def current_slot(local_now: datetime) -> str:
    minute = local_now.hour * 60 + local_now.minute
    return f"{local_now.date().isoformat()}:{minute:04d}"


def matching_slot(
    configurations: AgentConfigurations,
    now: datetime,
    timezone_name: str,
) -> str | None:
    """Return the dedupe slot key if `now` is a scheduled minute, else None.

    Empty `timeOfDay` means the agent is not scheduled. Empty `dayOfWeek` means
    every day. `month` None means every month. Times are interpreted in
    `timezone_name` (MVP default UTC).
    """
    if not configurations.time_of_day:
        return None
    tz = ZoneInfo(timezone_name)
    local = now.astimezone(tz)
    if configurations.month is not None and local.month != configurations.month:
        return None
    js_weekday = (local.weekday() + 1) % 7
    if configurations.day_of_week and js_weekday not in configurations.day_of_week:
        return None
    minute = local.hour * 60 + local.minute
    if minute not in configurations.time_of_day:
        return None
    return current_slot(local)
