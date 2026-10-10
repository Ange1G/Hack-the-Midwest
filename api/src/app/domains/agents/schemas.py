import uuid
from datetime import datetime, time
from typing import Any

from pydantic import BaseModel, Field


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
