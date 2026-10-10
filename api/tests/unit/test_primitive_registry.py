from typing import get_args

import pytest
from pydantic import ValidationError

from app.domains.primitives.base import SECRET_PLACEHOLDER, BaseContract
from app.domains.primitives.http_contract import HttpContract
from app.domains.primitives.mcp_contract import McpContract
from app.domains.primitives.registry import (
    CONNECTORS,
    connector_catalog,
    parse_contract,
    split_credentials,
)

HTTP = {
    "type": "http",
    "contractVersion": 1,
    "name": "list_items",
    "config": {"method": "GET", "URL": "https://api.example.com/x"},
}
MCP = {
    "type": "mcp",
    "contractVersion": 1,
    "name": "linear",
    "config": {"URL": "https://mcp.example.com/mcp"},
}


# ---------- dispatch on `type` ----------


def test_type_selects_the_contract() -> None:
    assert isinstance(parse_contract(HTTP), HttpContract)
    assert isinstance(parse_contract(MCP), McpContract)


@pytest.mark.parametrize("bad_type", [None, "ftp", "HTTP"])
def test_missing_or_unknown_type_is_rejected(bad_type: str | None) -> None:
    body = {k: v for k, v in HTTP.items() if k != "type"}
    if bad_type is not None:
        body["type"] = bad_type
    with pytest.raises(ValidationError):
        parse_contract(body)


def test_config_of_another_type_is_rejected() -> None:
    with pytest.raises(ValidationError):
        parse_contract({**MCP, "config": HTTP["config"]})


# ---------- the generic contract applies to every connector ----------


@pytest.mark.parametrize("contract", [HTTP, MCP], ids=["http", "mcp"])
def test_shared_fields_behave_the_same_for_every_type(contract: dict[str, object]) -> None:
    parsed = parse_contract(
        {**contract, "description": "What it is for", "options": {"retries": 1, "timeout": 500}}
    )
    assert parsed.description == "What it is for"
    assert parsed.options is not None and parsed.options.retries == 1
    for bad in (
        {"contractVersion": 2},
        {"name": "Bad Name"},
        {"description": "x" * 1001},
        {"options": {"retries": 6}},
        {"options": {"timeout": 99}},
        {"unexpected": True},
    ):
        with pytest.raises(ValidationError):
            parse_contract({**contract, **bad})


# ---------- credentials ----------


@pytest.mark.parametrize("contract", [HTTP, MCP], ids=["http", "mcp"])
def test_split_credentials_masks_every_value(contract: dict[str, object]) -> None:
    parsed = parse_contract(
        {**contract, "credentials": {"xApiKey": "key-1", "authorizationHeader": "Bearer t"}}
    )
    stored, secrets = split_credentials(parsed)

    assert stored["credentials"] == {
        "xApiKey": SECRET_PLACEHOLDER,
        "authorizationHeader": SECRET_PLACEHOLDER,
    }
    assert secrets == {"xApiKey": "key-1", "authorizationHeader": "Bearer t"}
    assert "key-1" not in repr(stored) and "Bearer t" not in repr(stored)
    assert stored["name"] == contract["name"] and stored["type"] == contract["type"]


def test_split_credentials_without_credentials() -> None:
    stored, secrets = split_credentials(parse_contract(HTTP))
    assert secrets == {}
    assert "credentials" not in stored


# ---------- registry and catalog ----------


def test_registry_lists_http_and_mcp() -> None:
    assert set(CONNECTORS) == {"http", "mcp"}


def test_every_registered_contract_uses_the_generic_base() -> None:
    for connector in CONNECTORS.values():
        assert issubclass(connector.contract, BaseContract)
        type_field = connector.contract.model_fields["type"]
        assert get_args(type_field.annotation) == (connector.type,)
        assert type_field.is_required()


def test_catalog_describes_each_connector() -> None:
    catalog = {entry["type"]: entry for entry in connector_catalog()}
    assert set(catalog) == {"http", "mcp"}
    for entry in catalog.values():
        assert entry["name"] and entry["description"]
        assert entry["credential_fields"] == ["xApiKey", "authorizationHeader"]
        schema = entry["config_schema"]
        assert {"type", "contractVersion", "name", "config"} <= set(schema["required"])
        assert "credentials" in schema["properties"]
