import uuid
from datetime import datetime, time
from typing import Any
from typing import Annotated

from pydantic import BaseModel, Field
from pydantic import AliasChoices, ConfigDict, StringConstraints


class AgentRead(BaseModel):
    id: uuid.UUID
    title: str
    system_prompt: str
    configurations: dict[str, Any]
    schedule_month: int | None
    schedule_day: int | None
    schedule_time: time | None
    owner_user_sso: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentListQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1)


MAX_SYSTEM_PROMPT_LENGTH = 20_000


class AgentCreate(BaseModel):
    """POST body. `configurations` is validated by the service (see AgentConfigurations)."""

    model_config = ConfigDict(extra="forbid")

    # `agentTile` is a typo in the team spec; accept it alongside the intended name.
    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
    ] = Field(validation_alias=AliasChoices("agentTitle", "agentTile", "title"))
    system_prompt: str = Field(
        validation_alias=AliasChoices("systemPrompt", "system_prompt"),
        max_length=MAX_SYSTEM_PROMPT_LENGTH,
    )
    configurations: dict[str, Any]
