import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ConnectorRead(BaseModel):
    id: uuid.UUID
    owner_user_sso: str
    type: str
    name: str
    contract: dict[str, Any]  # credentials masked as "********"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectorToolsRead(BaseModel):
    connector_id: uuid.UUID
    type: str
    tools: list[str]
