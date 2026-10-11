import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WebhookCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_agent_id: uuid.UUID


class WebhookRead(BaseModel):
    id: uuid.UUID
    owner_user_sso: str
    target_agent_id: uuid.UUID
    secret: str
    disabled: bool
    created_at: datetime
