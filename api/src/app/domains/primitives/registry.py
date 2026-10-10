"""Registry of connector types.

To add a connector type: write a BaseContract subclass and add one ConnectorType entry
below. Contract validation, credential handling and the catalog derive from it.
"""

from dataclasses import dataclass
from typing import Annotated, Any, Union

from pydantic import Field, TypeAdapter

from app.domains.primitives.base import (
    SECRET_PLACEHOLDER,
    BaseContract,
    contract_dump,
)
from app.domains.primitives.http_contract import HttpContract
from app.domains.primitives.mcp_contract import McpContract


@dataclass(frozen=True)
class ConnectorType:
    type: str
    name: str
    description: str
    contract: type[BaseContract]


CONNECTORS: dict[str, ConnectorType] = {
    connector.type: connector
    for connector in (
        ConnectorType(
            type="http",
            name="HTTP request",
            description="Call an HTTP API endpoint with a fixed method and URL.",
            contract=HttpContract,
        ),
        ConnectorType(
            type="mcp",
            name="MCP server",
            description="Use tools from a remote MCP server you provide.",
            contract=McpContract,
        ),
    )
}

# Built from CONNECTORS so the registry stays the single source of truth.
ConnectorContract = Annotated[
    Union[tuple(c.contract for c in CONNECTORS.values())],  # noqa: UP007
    Field(discriminator="type"),
]
_contract_adapter: TypeAdapter[BaseContract] = TypeAdapter(ConnectorContract)


def parse_contract(raw: Any) -> BaseContract:
    """Validate a generic contract; `type` selects the connector. Raises ValidationError."""
    return _contract_adapter.validate_python(raw)


def split_credentials(contract: BaseContract) -> tuple[dict[str, Any], dict[str, str]]:
    """Return (contract JSON with credentials masked, credential values by field name)."""
    stored = contract_dump(contract)
    supplied = {k: v for k, v in (stored.pop("credentials", None) or {}).items() if v}
    if supplied:
        stored["credentials"] = dict.fromkeys(supplied, SECRET_PLACEHOLDER)
    return stored, supplied


def connector_catalog() -> list[dict[str, Any]]:
    """What the frontend needs to render a form for each connector type."""
    return [
        {
            "type": c.type,
            "name": c.name,
            "description": c.description,
            "credential_fields": list(c.contract.credential_fields()),
            "config_schema": c.contract.model_json_schema(by_alias=True),
        }
        for c in CONNECTORS.values()
    ]
