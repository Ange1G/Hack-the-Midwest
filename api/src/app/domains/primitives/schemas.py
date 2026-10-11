from typing import Any

from pydantic import BaseModel


class ConnectorTypeRead(BaseModel):
    type: str
    name: str
    description: str
    credential_fields: list[str]
    config_schema: dict[str, Any]
