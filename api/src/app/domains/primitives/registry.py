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
from app.domains.primitives.database_contract import DATABASE_MODES, DatabaseContract
from app.domains.primitives.http_contract import HttpContract
from app.domains.primitives.knowledge_contract import KnowledgeContract
from app.domains.primitives.mcp_contract import McpContract
from app.domains.primitives.notification_contract import NotificationContract


@dataclass(frozen=True)
class ConnectorType:
    type: str
    name: str
    description: str
    contract: type[BaseContract]
    # Tags of discriminated unions inside the contract (e.g. database config modes).
    nested_tags: tuple[str, ...] = ()


CONNECTORS: dict[str, ConnectorType] = {
    connector.type: connector
    for connector in (
        ConnectorType(
            type="http",
            name="HTTP request",
            description=(
                "Call an HTTP API endpoint with a fixed method and URL. "
                "Optional query and body allowlists let the agent fill in values."
            ),
            contract=HttpContract,
        ),
        ConnectorType(
            type="mcp",
            name="MCP server",
            description="Use tools from a remote MCP server you provide.",
            contract=McpContract,
        ),
        ConnectorType(
            type="database",
            name="Database",
            description=(
                "Use a PostgreSQL, MySQL, MongoDB or Redis database: one you run, or one "
                "the platform starts for the agent."
            ),
            contract=DatabaseContract,
            nested_tags=DATABASE_MODES,
        ),
        ConnectorType(
            type="notification",
            name="Notification",
            description=(
                "Send a JSON message to a destination you choose, such as a Slack "
                "incoming webhook or a pager. The agent fills only the listed fields."
            ),
            contract=NotificationContract,
        ),
        ConnectorType(
            type="knowledge",
            name="Knowledge",
            description=(
                "Text documents you paste in (runbooks, policies, notes). The agent can "
                "keyword-search them and read the matching passages."
            ),
            contract=KnowledgeContract,
        ),
    )
}

# Tags of unions nested inside contracts, for describe_validation_errors(nested_tags=...).
NESTED_TAGS: frozenset[str] = frozenset().union(*(c.nested_tags for c in CONNECTORS.values()))

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
