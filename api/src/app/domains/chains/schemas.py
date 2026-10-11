import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.domains.agents.configurations import MAX_TIMES_PER_DAY, DayOfWeek, MinuteOfDay

MAX_CHAIN_STEPS_SCHEMA = 20


def _unique_sorted(values: list[int]) -> list[int]:
    return sorted(set(values))


class ChainSchedule(BaseModel):
    """Same shape as agent `dayOfWeek` / `timeOfDay` / `month` (no primitives)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    month: int | None = Field(default=None, ge=1, le=12)
    day_of_week: Annotated[list[DayOfWeek], AfterValidator(_unique_sorted)] = Field(
        default_factory=list, alias="dayOfWeek", max_length=7
    )
    time_of_day: Annotated[list[MinuteOfDay], AfterValidator(_unique_sorted)] = Field(
        default_factory=list, alias="timeOfDay", max_length=MAX_TIMES_PER_DAY
    )


class ChainStepCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    agent_id: uuid.UUID
    label: Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)] | None = None


class ChainCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
    ]
    steps: list[ChainStepCreate] = Field(min_length=1, max_length=MAX_CHAIN_STEPS_SCHEMA)
    schedule: ChainSchedule | None = None


class ChainStepRead(BaseModel):
    position: int
    agent_id: uuid.UUID
    label: str | None


class ChainRead(BaseModel):
    id: uuid.UUID
    owner_user_sso: str
    title: str
    schedule: dict | None
    steps: list[ChainStepRead]
    created_at: datetime
    updated_at: datetime


class ChainRunRead(BaseModel):
    """Summary for polling. Intermediate step outputs are on GET .../steps only."""

    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    chain_id: uuid.UUID
    owner_user_sso: str
    status: str
    input: str | None
    trigger: str
    final_result: dict | None
    error_code: str | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ChainRunStepRead(BaseModel):
    position: int
    agent_id: uuid.UUID
    label: str | None
    status: str
    execution_id: uuid.UUID | None
    input: str | None
    result: dict | None
    error_code: str | None
    error_message: str | None
