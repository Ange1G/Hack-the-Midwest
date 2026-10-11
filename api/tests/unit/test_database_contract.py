import copy
from typing import Any

import pytest
from pydantic import ValidationError

from app.common.validation_errors import describe_validation_errors
from app.domains.primitives.base import SECRET_PLACEHOLDER, contract_dump
from app.domains.primitives.database_contract import (
    DatabaseContract,
    Engine,
    ExternalDatabaseConfig,
    ProvisionedDatabaseConfig,
)
from app.domains.primitives.registry import (
    CONNECTORS,
    NESTED_TAGS,
    connector_catalog,
    parse_contract,
    split_credentials,
)

CA = "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n"

EXTERNAL: dict[str, Any] = {
    "type": "database",
    "contractVersion": 1,
    "name": "orders_db",
    "description": "Orders read replica. Tables: orders, customers.",
    "options": {"retries": 2, "timeout": 10000},
    "credentials": {"username": "agent_reader", "password": "s3cret-db-pass"},
    "config": {
        "mode": "external",
        "engine": "postgres",
        "host": "db.example.com",
        "database": "orders",
    },
}

PROVISIONED: dict[str, Any] = {
    "type": "database",
    "contractVersion": 1,
    "name": "scratch",
    "config": {"mode": "provisioned", "engine": "postgres"},
}


def changed(base: dict[str, Any], path: str, value: object) -> dict[str, Any]:
    body = copy.deepcopy(base)
    target = body
    *parents, last = path.split(".")
    for key in parents:
        target = target.setdefault(key, {})
    if value is ...:
        target.pop(last, None)
    else:
        target[last] = value
    return body


def errors_for(body: dict[str, Any]) -> list[dict[str, str]]:
    with pytest.raises(ValidationError) as exc:
        parse_contract(body)
    return describe_validation_errors(
        exc.value, tags=CONNECTORS, nested_tags=NESTED_TAGS, root_field="type"
    )


# --- external -------------------------------------------------------------------------


def test_external_contract_with_defaults() -> None:
    c = parse_contract(EXTERNAL)
    assert isinstance(c, DatabaseContract)
    assert isinstance(c.config, ExternalDatabaseConfig)
    assert c.config.engine is Engine.POSTGRES
    assert c.config.port == 5432
    assert c.config.tls == "verifyFull"
    assert c.config.access == "readOnly"
    assert c.credentials is not None and c.credentials.password == "s3cret-db-pass"


@pytest.mark.parametrize(
    ("engine", "port"), [("postgres", 5432), ("mysql", 3306), ("mongodb", 27017)]
)
def test_external_default_port_per_engine(engine: str, port: int) -> None:
    c = parse_contract(changed(EXTERNAL, "config.engine", engine))
    assert c.config.port == port


def test_external_redis_needs_no_username_or_database() -> None:
    body = changed(EXTERNAL, "config.engine", "redis")
    body = changed(body, "config.database", ...)
    body = changed(body, "credentials.username", ...)
    c = parse_contract(body)
    assert c.config.port == 6379
    assert c.config.database is None


def test_external_redis_database_index() -> None:
    body = changed(EXTERNAL, "config.engine", "redis")
    assert parse_contract(changed(body, "config.database", "15")).config.database == "15"


def test_external_akamai_style_managed_database() -> None:
    body = changed(EXTERNAL, "config.host", "lin-1234-5678-pgsql-primary.servers.linodedb.net")
    body = changed(body, "config.caCertificate", CA)
    body = changed(body, "config.access", "readWrite")
    c = parse_contract(body)
    assert c.config.ca_certificate == CA
    assert c.config.access == "readWrite"
    assert contract_dump(c)["config"]["caCertificate"] == CA


def test_external_public_ip_host_is_accepted() -> None:
    assert parse_contract(changed(EXTERNAL, "config.host", "1.1.1.1")).config.host == "1.1.1.1"


def test_documentation_ip_ranges_are_not_public() -> None:
    assert errors_for(changed(EXTERNAL, "config.host", "203.0.113.10"))[0]["field"] == (
        "config.host"
    )


@pytest.mark.parametrize(
    ("path", "value", "field", "reason"),
    [
        ("config.mode", ..., "config", "mode is required"),
        ("config.mode", "managed", "config", "unknown mode"),
        ("config.engine", "oracle", "config.engine", "unknown engine"),
        ("config.host", ..., "config.host", "host required"),
        ("config.host", "localhost", "config.host", "SSRF: loopback name"),
        ("config.host", "127.0.0.1", "config.host", "SSRF: loopback IP"),
        ("config.host", "10.0.0.5", "config.host", "SSRF: private IP"),
        ("config.host", "169.254.169.254", "config.host", "SSRF: metadata service"),
        ("config.host", "postgres", "config.host", "SSRF: single-label (docker service) name"),
        ("config.host", "db.internal", "config.host", "SSRF: internal suffix"),
        ("config.host", "postgres://db.example.com", "config.host", "host, not a URL"),
        ("config.host", "db.example.com:5432", "config.host", "port goes in port"),
        ("config.port", 0, "config.port", "port range"),
        ("config.port", 70000, "config.port", "port range"),
        ("config.tls", "disable", "config.tls", "no plaintext credentials over the internet"),
        ("config.access", "admin", "config.access", "unknown access level"),
        ("config.caCertificate", "not a pem", "config.caCertificate", "PEM only"),
        ("config.database", ..., "config", "database required for postgres"),
        ("config.database", "orders; drop", "config", "database name characters"),
        ("config.lifecycle", "run", "config.lifecycle", "provisioned-only field"),
        ("credentials", ..., "credentials", "external databases need credentials"),
        ("credentials.password", ..., "credentials", "password required"),
        ("credentials.username", ..., "credentials", "username required for postgres"),
        ("credentials.password", SECRET_PLACEHOLDER, "credentials.password", "placeholder"),
        ("credentials.token", "x", "credentials.token", "unknown credential field"),
    ],
)
def test_external_rejections(path: str, value: object, field: str, reason: str) -> None:
    errors = errors_for(changed(EXTERNAL, path, value))
    assert field in {e["field"] for e in errors}, (reason, errors)


def test_external_redis_database_must_be_an_index() -> None:
    body = changed(EXTERNAL, "config.engine", "redis")
    errors = errors_for(changed(body, "config.database", "orders"))
    assert errors[0]["field"] == "config"
    assert "0 to 15" in errors[0]["message"]


def test_error_messages_never_echo_credentials() -> None:
    body = changed(EXTERNAL, "credentials.username", "")
    body = changed(body, "config.host", "10.0.0.5")
    text = str(errors_for(body))
    assert "s3cret-db-pass" not in text


# --- provisioned ----------------------------------------------------------------------


def test_provisioned_contract_with_defaults() -> None:
    c = parse_contract(PROVISIONED)
    assert isinstance(c.config, ProvisionedDatabaseConfig)
    assert c.config.version == "16"
    assert c.config.database == "agent"
    assert c.config.lifecycle == "agent"
    assert c.config.memory_mb == 512
    assert c.credentials is None
    assert contract_dump(c)["config"] == {
        "mode": "provisioned",
        "engine": "postgres",
        "version": "16",
        "database": "agent",
        "lifecycle": "agent",
        "memoryMb": 512,
    }


@pytest.mark.parametrize(
    ("engine", "version"), [("mysql", "8.4"), ("mongodb", "8.0"), ("redis", "7")]
)
def test_provisioned_default_version_per_engine(engine: str, version: str) -> None:
    c = parse_contract(changed(PROVISIONED, "config.engine", engine))
    assert c.config.version == version


def test_provisioned_redis_has_no_database_name() -> None:
    c = parse_contract(changed(PROVISIONED, "config.engine", "redis"))
    assert c.config.database is None


def test_provisioned_accepts_supplied_credentials() -> None:
    body = changed(PROVISIONED, "credentials", {"username": "app", "password": "x" * 12})
    body = changed(body, "config.lifecycle", "run")
    body = changed(body, "config.version", "17")
    c = parse_contract(body)
    assert c.credentials is not None and c.credentials.username == "app"
    assert c.config.lifecycle == "run"


@pytest.mark.parametrize(
    ("path", "value", "field", "reason"),
    [
        ("config.version", "9", "config", "unsupported version"),
        ("config.version", "8.4", "config", "mysql version for postgres"),
        ("config.lifecycle", "forever", "config.lifecycle", "unknown lifecycle"),
        ("config.memoryMb", 128, "config.memoryMb", "below floor"),
        ("config.memoryMb", 4096, "config.memoryMb", "above ceiling"),
        ("config.database", "Agent-DB", "config.database", "provisioned names are simple"),
        ("config.host", "db.example.com", "config.host", "external-only field"),
        ("credentials.password", "short", "credentials", "supplied passwords >= 12"),
        ("credentials.username", "Admin!", "credentials", "username is identifier-like"),
    ],
)
def test_provisioned_rejections(path: str, value: object, field: str, reason: str) -> None:
    errors = errors_for(changed(PROVISIONED, path, value))
    assert field in {e["field"] for e in errors}, (reason, errors)


def test_provisioned_mysql_needs_more_memory_and_no_root_user() -> None:
    body = changed(PROVISIONED, "config.engine", "mysql")
    assert "512" in errors_for(changed(body, "config.memoryMb", 256))[0]["message"]
    root = changed(body, "credentials", {"username": "root", "password": "x" * 12})
    assert errors_for(root)[0]["field"] == "credentials"


def test_provisioned_redis_rejects_username_and_database() -> None:
    body = changed(PROVISIONED, "config.engine", "redis")
    assert errors_for(changed(body, "config.database", "agent"))[0]["field"] == "config"
    user = changed(body, "credentials", {"username": "app", "password": "x" * 12})
    assert errors_for(user)[0]["field"] == "credentials"


# --- registry -------------------------------------------------------------------------


def test_credentials_are_split_and_masked() -> None:
    stored, secrets = split_credentials(parse_contract(EXTERNAL))
    assert secrets == {"username": "agent_reader", "password": "s3cret-db-pass"}
    assert stored["credentials"] == {"username": SECRET_PLACEHOLDER, "password": SECRET_PLACEHOLDER}
    assert "s3cret" not in str(stored)


def test_provisioned_without_credentials_stores_none() -> None:
    stored, secrets = split_credentials(parse_contract(PROVISIONED))
    assert secrets == {}
    assert "credentials" not in stored


def test_catalog_lists_database_with_both_modes() -> None:
    entry = next(c for c in connector_catalog() if c["type"] == "database")
    assert entry["credential_fields"] == ["username", "password"]
    schema = str(entry["config_schema"])
    assert "external" in schema and "provisioned" in schema
    assert DatabaseContract.credential_fields() == ("username", "password")
