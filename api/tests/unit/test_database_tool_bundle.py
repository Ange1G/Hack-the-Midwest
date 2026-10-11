import uuid

from app.domains.primitives.database_contract import Engine
from app.runtime.agent_databases import DatabaseConnection
from app.worker.bundle import build_database_tool_bundle


def _connection(**overrides: object) -> DatabaseConnection:
    defaults: dict[str, object] = {
        "connector_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "name": "orders_db",
        "description": "Orders replica",
        "engine": Engine.POSTGRES,
        "host": "db.example.com",
        "port": 5432,
        "database": "orders",
        "username": "reader",
        "password": "p@ss-secret",
        "tls": "verifyFull",
        "read_only": True,
        "provisioned": False,
        "addresses": ("198.51.100.7",),
        "timeout_ms": 5000,
        "retries": 1,
    }
    defaults.update(overrides)
    return DatabaseConnection(**defaults)  # type: ignore[arg-type]


def test_database_bundle_keeps_password_out_of_tools() -> None:
    bundle = build_database_tool_bundle({"orders_db": _connection()})
    assert bundle.tools == [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "orders_db",
            "engine": "postgres",
            "host": "db.example.com",
            "port": 5432,
            "database": "orders",
            "username": "reader",
            "tls": "verifyFull",
            "read_only": True,
            "timeout_ms": 5000,
            "retries": 1,
            "row_limit": 100,
            "addresses": ["198.51.100.7"],
        }
    ]
    assert bundle.credentials == {
        "11111111-1111-1111-1111-111111111111": {"password": "p@ss-secret"}
    }
    assert "p@ss-secret" not in str(bundle.tools)


def test_loopback_host_is_rewritten_for_the_runner_container() -> None:
    bundle = build_database_tool_bundle(
        {
            "scratch": _connection(
                name="scratch",
                host="127.0.0.1",
                port=49001,
                database="agent",
                username="agent",
                password="local-secret",
                tls="disable",
                read_only=False,
                provisioned=True,
                addresses=(),
            )
        }
    )
    assert bundle.tools[0]["host"] == "host.docker.internal"
    assert bundle.tools[0]["port"] == 49001
    assert "local-secret" not in str(bundle.tools)


def test_ca_certificate_travels_with_credentials_only() -> None:
    pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----"
    bundle = build_database_tool_bundle(
        {"orders_db": _connection(ca_certificate=pem)}
    )
    assert "BEGIN CERTIFICATE" not in str(bundle.tools)
    assert bundle.credentials["11111111-1111-1111-1111-111111111111"]["caCertificate"] == pem


def test_empty_connections_yield_empty_bundle() -> None:
    bundle = build_database_tool_bundle({})
    assert bundle.tools == []
    assert bundle.credentials == {}
