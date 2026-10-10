import copy

import pytest
from pydantic import ValidationError

from app.domains.primitives.base import SECRET_PLACEHOLDER, BaseContract
from app.domains.primitives.mcp_contract import McpContract

MCP_URL = "https://mcp.example.com/mcp"

VALID = {
    "type": "mcp",
    "contractVersion": 1,
    "name": "linear",
    "config": {"URL": MCP_URL},
}


def with_changes(path: str, value: object) -> dict[str, object]:
    body = copy.deepcopy(VALID)
    target = body
    *parents, last = path.split(".")
    for key in parents:
        target = target.setdefault(key, {})  # type: ignore[assignment]
    if value is ...:
        target.pop(last, None)  # type: ignore[union-attr]
    else:
        target[last] = value  # type: ignore[index]
    return body


def test_accepts_the_team_mcp_contract() -> None:
    c = McpContract.model_validate(
        {
            "type": "mcp",
            "contractVersion": 1,
            "name": "linear",
            "description": "Team Linear workspace",
            "options": {"retries": 2, "timeout": 15000},
            "credentials": {"authorizationHeader": "Bearer t"},
            "config": {"URL": MCP_URL},
        }
    )
    assert isinstance(c, BaseContract)
    assert str(c.config.url) == MCP_URL
    assert c.config.transport == "streamableHttp"
    assert c.credentials is not None and c.credentials.authorization_header == "Bearer t"
    assert c.options is not None and c.options.timeout == 15000


def test_transport_defaults_to_streamable_http_and_serializes() -> None:
    dumped = McpContract.model_validate(VALID).model_dump(
        mode="json", by_alias=True, exclude_none=True
    )
    assert dumped["config"] == {"URL": MCP_URL, "transport": "streamableHttp"}


def test_credential_fields_are_the_credentials_section() -> None:
    assert McpContract.credential_fields() == ("xApiKey", "authorizationHeader")


@pytest.mark.parametrize(
    ("path", "value", "reason"),
    [
        ("type", ..., "type is required"),
        ("type", "http", "wrong type for this contract"),
        ("name", "Linear!", "name must be identifier-like"),
        ("contractVersion", 2, "unknown version"),
        ("config", ..., "config required"),
        ("config.URL", ..., "URL required"),
        ("config.URL", "http://localhost:3000/mcp", "SSRF guard"),
        ("config.URL", "https://192.168.0.10/mcp", "SSRF guard"),
        ("config.URL", "ws://mcp.example.com/", "http/https only"),
        ("config.transport", "stdio", "stdio would run processes on our hosts"),
        ("config.transport", "sse", "legacy transport"),
        ("config.method", "GET", "HTTP-only field"),
        ("credentials", {"xApiKey": SECRET_PLACEHOLDER}, "placeholder is not a credential"),
        ("options", {"retries": 6}, "shared option bounds"),
    ],
)
def test_rejects_invalid_contracts(path: str, value: object, reason: str) -> None:
    with pytest.raises(ValidationError):
        McpContract.model_validate(with_changes(path, value))
