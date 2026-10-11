import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class WebhookCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_type: Literal["agent", "chain"] = "agent"
    target_agent_id: uuid.UUID | None = None
    target_chain_id: uuid.UUID | None = None


class WebhookRead(BaseModel):
    id: uuid.UUID
    owner_user_sso: str
    target_type: Literal["agent", "chain"] = "agent"
    target_agent_id: uuid.UUID | None = None
    target_chain_id: uuid.UUID | None = None
    secret: str
    disabled: bool
    created_at: datetime
