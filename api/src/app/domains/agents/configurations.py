"""Typed schema for the `agents.configurations` JSONB column."""

from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.domains.primitives.http_contract import SECRET_FIELDS, SECRET_PLACEHOLDER, HttpContract

__all__ = [
    "SECRET_PLACEHOLDER",
    "AgentConfigurations",
    "ExtractedSecret",
    "split_secrets",
]

MAX_PRIMITIVES_PER_AGENT = 20
MINUTES_PER_DAY = 24 * 60
MAX_TIMES_PER_DAY = 48  # one run every 30 minutes

# The model refers to primitives by these names, so keep them identifier-like.
PrimitiveName = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
# 0 = Sunday ... 6 = Saturday, matching JavaScript's Date.getDay().
DayOfWeek = Annotated[int, Field(ge=0, le=6)]
# Minutes after midnight, e.g. 540 = 09:00.
MinuteOfDay = Annotated[int, Field(ge=0, le=MINUTES_PER_DAY - 1)]


def _unique_sorted(values: list[int]) -> list[int]:
    return sorted(set(values))


class AgentConfigurations(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    primitives: dict[PrimitiveName, HttpContract] = Field(
        default_factory=dict, max_length=MAX_PRIMITIVES_PER_AGENT
    )
    month: int | None = Field(default=None, ge=1, le=12)
    day_of_week: Annotated[list[DayOfWeek], AfterValidator(_unique_sorted)] = Field(
        default_factory=list, alias="dayOfWeek", max_length=7
    )
    time_of_day: Annotated[list[MinuteOfDay], AfterValidator(_unique_sorted)] = Field(
        default_factory=list, alias="timeOfDay", max_length=MAX_TIMES_PER_DAY
    )


@dataclass(frozen=True)
class ExtractedSecret:
    primitive_name: str
    field_name: str
    value: str


def split_secrets(
    configurations: AgentConfigurations,
) -> tuple[dict[str, Any], list[ExtractedSecret]]:
    """Return (JSON safe to store and show, credentials to store separately).

    Credentials are replaced by SECRET_PLACEHOLDER so clients can see one is configured
    without ever receiving it.
    """
    stored = configurations.model_dump(mode="json", by_alias=True, exclude_none=True)
    secrets: list[ExtractedSecret] = []
    for name, contract in stored.get("primitives", {}).items():
        for field in SECRET_FIELDS:
            value = contract.get(field)
            if value:
                secrets.append(ExtractedSecret(primitive_name=name, field_name=field, value=value))
                contract[field] = SECRET_PLACEHOLDER
    return stored, secrets
