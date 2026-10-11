"""Typed schema for the `agents.configurations` JSONB column.

    { primitives: { "<connectorId>": { allowedTools?: [...] } },
      month, dayOfWeek, timeOfDay, memory, delegates: ["<agentId>"], outputSchema }

Agents reference the owner's connectors by ID; they never hold connector contracts or
credentials themselves.
"""

import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.domains.agents.output_schema import OutputSchema
from app.domains.primitives.mcp_contract import McpToolName

MAX_PRIMITIVES_PER_AGENT = 20
MAX_ALLOWED_TOOLS = 100
MAX_DELEGATES_PER_AGENT = 5
MINUTES_PER_DAY = 24 * 60
MAX_TIMES_PER_DAY = 48  # one run every 30 minutes

# 0 = Sunday ... 6 = Saturday, matching JavaScript's Date.getDay().
DayOfWeek = Annotated[int, Field(ge=0, le=6)]
# Minutes after midnight, e.g. 540 = 09:00.
MinuteOfDay = Annotated[int, Field(ge=0, le=MINUTES_PER_DAY - 1)]


def _unique_sorted(values: list[int]) -> list[int]:
    return sorted(set(values))


def _dedupe_preserving_order(names: list[str] | None) -> list[str] | None:
    return None if names is None else list(dict.fromkeys(names))


def _dedupe_uuids(values: list[uuid.UUID]) -> list[uuid.UUID]:
    return list(dict.fromkeys(values))


class ConnectorReference(BaseModel):
    """How one agent uses one of its owner's connectors."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    # MCP connectors: the server tools this agent may call (least privilege). Required
    # for MCP and rejected for HTTP; AgentService enforces that against the connector type.
    allowed_tools: Annotated[
        list[McpToolName] | None, AfterValidator(_dedupe_preserving_order)
    ] = Field(default=None, alias="allowedTools", min_length=1, max_length=MAX_ALLOWED_TOOLS)


class AgentConfigurations(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    primitives: dict[uuid.UUID, ConnectorReference] = Field(
        default_factory=dict, max_length=MAX_PRIMITIVES_PER_AGENT
    )
    month: int | None = Field(default=None, ge=1, le=12)
    day_of_week: Annotated[list[DayOfWeek], AfterValidator(_unique_sorted)] = Field(
        default_factory=list, alias="dayOfWeek", max_length=7
    )
    time_of_day: Annotated[list[MinuteOfDay], AfterValidator(_unique_sorted)] = Field(
        default_factory=list, alias="timeOfDay", max_length=MAX_TIMES_PER_DAY
    )
    # Persist key/value memory across runs (see domains.memory).
    memory: bool = Field(default=False, exclude_if=lambda value: not value)
    # Other agents of the same owner this agent may call as tools. AgentService checks
    # ownership and self-reference; the worker re-checks at run time.
    delegates: Annotated[list[uuid.UUID], AfterValidator(_dedupe_uuids)] = Field(
        default_factory=list,
        max_length=MAX_DELEGATES_PER_AGENT,
        exclude_if=lambda value: not value,
    )
    # JSON Schema the final reply must match; the runner validates it (see output_schema).
    output_schema: OutputSchema | None = Field(default=None, alias="outputSchema")
