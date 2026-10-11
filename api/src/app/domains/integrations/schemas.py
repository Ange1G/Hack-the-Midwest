from typing import Annotated

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, StringConstraints

from app.domains.primitives.base import MAX_CREDENTIAL_LENGTH, ConnectorName


class IntegrationRead(BaseModel):
    id: str
    name: str
    vendor: str
    category: str
    description: str
    docs_url: str
    api_key_url: str
    connector_type: str
    connector_name: str
    url: str
    api_key_required: bool
    tools: list[str]
    default_allowed_tools: list[str]


class IntegrationInstall(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    api_key: (
        Annotated[
            str,
            StringConstraints(
                strip_whitespace=True, min_length=1, max_length=MAX_CREDENTIAL_LENGTH - 16
            ),
        ]
        | None
    ) = Field(default=None, validation_alias=AliasChoices("apiKey", "api_key"))
    name: ConnectorName | None = None


class AgentTemplateRead(BaseModel):
    id: str
    name: str
    description: str
    title: str
    system_prompt: str
    integrations: list[str]
    allowed_tools: dict[str, list[str]]
    memory: bool
    suggested_input: str | None
