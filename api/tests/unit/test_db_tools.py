import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from db_tools import (  # noqa: E402
    ReadOnlyQueryError,
    execute_database_tool,
    is_read_only_mongo,
    is_read_only_redis,
    is_read_only_sql,
)

SPEC = {
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
    "retries": 0,
    "row_limit": 10,
}


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1",
        "select id from orders where status = %s",
        "WITH recent AS (SELECT * FROM orders) SELECT * FROM recent",
        "EXPLAIN SELECT * FROM orders",
    ],
)
def test_read_only_sql_allows_selects(sql: str) -> None:
    assert is_read_only_sql(sql) is True


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO orders VALUES (1)",
        "UPDATE orders SET status = 'x'",
        "DELETE FROM orders",
        "DROP TABLE orders",
        "ALTER TABLE orders ADD COLUMN x int",
        "SELECT 1; DELETE FROM orders",
        "WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x",
        "/* SELECT 1 */ DELETE FROM orders",
        "-- SELECT 1\nUPDATE orders SET x = 1",
        "",
    ],
)
def test_read_only_sql_rejects_writes_and_batches(sql: str) -> None:
    assert is_read_only_sql(sql) is False


def test_read_only_redis_and_mongo() -> None:
    assert is_read_only_redis("GET foo") is True
    assert is_read_only_redis("SET foo bar") is False
    assert is_read_only_mongo("find") is True
    assert is_read_only_mongo("insertOne") is False


def test_read_only_connector_rejects_write_without_hitting_the_database() -> None:
    def fail_if_called(*_args: object, **_kwargs: object) -> list[object]:
        raise AssertionError("executor must not run for a rejected write")

    with pytest.raises(ReadOnlyQueryError, match="read-only"):
        execute_database_tool(
            SPEC,
            {"password": "secret"},
            "DELETE FROM orders",
            executor=fail_if_called,
        )


def test_execute_uses_injected_executor_for_select() -> None:
    captured: dict[str, object] = {}

    def executor(
        spec: dict[str, object],
        credentials: dict[str, str],
        statement: str,
        params: list[object] | None,
        row_limit: int,
        timeout_ms: int,
    ) -> list[dict[str, object]]:
        captured.update(
            {
                "name": spec["name"],
                "statement": statement,
                "params": params,
                "row_limit": row_limit,
                "timeout_ms": timeout_ms,
                "password": credentials["password"],
            }
        )
        return [{"id": 1, "status": "open"}]

    text = execute_database_tool(
        SPEC,
        {"password": "secret"},
        "SELECT id, status FROM orders",
        params=["open"],
        executor=executor,
    )
    assert captured["statement"] == "SELECT id, status FROM orders"
    assert captured["params"] == ["open"]
    assert captured["row_limit"] == 10
    assert "secret" not in text
    assert "open" in text
    assert "id" in text


def test_read_write_connector_allows_write_sql() -> None:
    spec = {**SPEC, "read_only": False}
    text = execute_database_tool(
        spec,
        {"password": "secret"},
        "INSERT INTO notes VALUES (1)",
        executor=lambda *_a, **_k: [{"ok": True}],
    )
    assert "ok" in text
