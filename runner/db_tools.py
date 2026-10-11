"""Execute bundled database connector tools. Read-only is enforced here, not by the model."""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Sequence
from typing import Any

DEFAULT_TIMEOUT_MS = 10_000
DEFAULT_ROW_LIMIT = 100
MAX_RESULT_CHARS = 8_000

_SQL_COMMENT = re.compile(r"/\*.*?\*/|--[^\n]*", re.DOTALL)
_FIRST_WORD = re.compile(r"^([A-Za-z]+)")
_SQL_WRITE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|"
    r"CALL|DO|EXECUTE|COMMENT|VACUUM|REINDEX|CLUSTER|LOCK|NOTIFY|LISTEN|"
    r"UNLISTEN|LOAD|SECURITY|MERGE)\b",
    re.IGNORECASE,
)
_SQL_READ_START = frozenset({"SELECT", "WITH", "EXPLAIN", "SHOW", "VALUES"})
_REDIS_READ = frozenset(
    {
        "GET",
        "MGET",
        "EXISTS",
        "TTL",
        "PTTL",
        "TYPE",
        "STRLEN",
        "HGET",
        "HGETALL",
        "HMGET",
        "HEXISTS",
        "LRANGE",
        "LLEN",
        "SMEMBERS",
        "SCARD",
        "ZRANGE",
        "ZCARD",
        "KEYS",
        "SCAN",
        "DBSIZE",
        "INFO",
        "PING",
    }
)
_MONGO_READ = frozenset({"FIND", "AGGREGATE", "COUNT", "DISTINCT", "LISTCOLLECTIONS"})

Executor = Callable[
    [dict[str, Any], dict[str, str], str, list[Any] | None, int, int],
    Sequence[Any],
]


class ReadOnlyQueryError(ValueError):
    pass


def is_read_only_sql(sql: str) -> bool:
    stripped = _SQL_COMMENT.sub("", sql).strip()
    if not stripped:
        return False
    statements = [part.strip() for part in stripped.split(";") if part.strip()]
    if len(statements) != 1:
        return False
    statement = statements[0]
    match = _FIRST_WORD.match(statement)
    if match is None or match.group(1).upper() not in _SQL_READ_START:
        return False
    return _SQL_WRITE.search(statement) is None


def is_read_only_redis(command: str) -> bool:
    match = _FIRST_WORD.match(command.strip())
    return match is not None and match.group(1).upper() in _REDIS_READ


def is_read_only_mongo(command: str) -> bool:
    match = _FIRST_WORD.match(command.strip())
    return match is not None and match.group(1).upper() in _MONGO_READ


def execute_database_tool(
    spec: dict[str, Any],
    credentials: dict[str, str],
    statement: str,
    *,
    params: list[Any] | None = None,
    executor: Executor | None = None,
) -> str:
    _assert_allowed(spec, statement)
    row_limit = max(int(spec.get("row_limit") or DEFAULT_ROW_LIMIT), 1)
    timeout_ms = max(int(spec.get("timeout_ms") or DEFAULT_TIMEOUT_MS), 100)
    run = executor or _dispatch
    rows = run(spec, credentials, statement, params, row_limit, timeout_ms)
    return _format_rows(rows)


def summarize_db_call(spec: dict[str, Any], status_line: str) -> dict[str, Any]:
    first_line = status_line.split("\n", 1)[0][:200]
    return {
        "name": spec.get("name"),
        "engine": spec.get("engine"),
        "status": first_line,
    }


def _assert_allowed(spec: dict[str, Any], statement: str) -> None:
    if not spec.get("read_only"):
        return
    engine = str(spec.get("engine") or "")
    allowed = True
    if engine in {"postgres", "mysql"}:
        allowed = is_read_only_sql(statement)
    elif engine == "redis":
        allowed = is_read_only_redis(statement)
    elif engine == "mongodb":
        allowed = is_read_only_mongo(statement)
    if not allowed:
        raise ReadOnlyQueryError(
            "This database connector is read-only; only read queries are allowed"
        )


def _format_rows(rows: Sequence[Any]) -> str:
    if not rows:
        return "0 rows"
    try:
        encoded = json.dumps(list(rows), default=str)
    except TypeError:
        encoded = str(list(rows))
    return encoded[:MAX_RESULT_CHARS]


def _dispatch(
    spec: dict[str, Any],
    credentials: dict[str, str],
    statement: str,
    params: list[Any] | None,
    row_limit: int,
    timeout_ms: int,
) -> Sequence[Any]:
    engine = str(spec.get("engine") or "")
    if engine == "postgres":
        return _execute_postgres(spec, credentials, statement, params, row_limit, timeout_ms)
    if engine == "mysql":
        return _execute_mysql(spec, credentials, statement, params, row_limit, timeout_ms)
    if engine == "redis":
        return _execute_redis(spec, credentials, statement, timeout_ms)
    if engine == "mongodb":
        return _execute_mongodb(spec, credentials, statement, row_limit, timeout_ms)
    raise ValueError(f"Unsupported database engine: {engine}")


def _execute_postgres(
    spec: dict[str, Any],
    credentials: dict[str, str],
    statement: str,
    params: list[Any] | None,
    row_limit: int,
    timeout_ms: int,
) -> Sequence[Any]:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise RuntimeError("postgres driver is not installed in the runner image") from exc

    sslmode = {"verifyFull": "verify-full", "require": "require", "disable": "disable"}.get(
        str(spec.get("tls") or "verifyFull"), "verify-full"
    )
    conninfo = (
        f"host={spec['host']} port={spec['port']} dbname={spec.get('database') or ''} "
        f"user={spec.get('username') or ''} password={credentials.get('password') or ''} "
        f"sslmode={sslmode} connect_timeout={max(timeout_ms // 1000, 1)}"
    )
    with psycopg.connect(conninfo, row_factory=dict_row) as conn:
        if spec.get("read_only"):
            conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        conn.execute(f"SET statement_timeout = {int(timeout_ms)}")
        with conn.cursor() as cursor:
            cursor.execute(statement, params)  # type: ignore[arg-type]
            if cursor.description is None:
                return [{"rowcount": cursor.rowcount}]
            return list(cursor.fetchmany(row_limit))


def _execute_mysql(
    spec: dict[str, Any],
    credentials: dict[str, str],
    statement: str,
    params: list[Any] | None,
    row_limit: int,
    timeout_ms: int,
) -> Sequence[Any]:
    try:
        import pymysql
        import pymysql.cursors
    except ImportError as exc:
        raise RuntimeError("mysql driver is not installed in the runner image") from exc

    conn = pymysql.connect(
        host=str(spec["host"]),
        port=int(spec["port"]),
        user=spec.get("username") or "",
        password=credentials.get("password") or "",
        database=spec.get("database") or "",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=max(timeout_ms // 1000, 1),
        read_timeout=max(timeout_ms // 1000, 1),
        ssl={"check_hostname": spec.get("tls") == "verifyFull"}
        if spec.get("tls") != "disable"
        else None,
    )
    try:
        with conn.cursor() as cursor:
            if spec.get("read_only"):
                cursor.execute("SET SESSION TRANSACTION READ ONLY")
            cursor.execute(statement, params)
            if cursor.description is None:
                return [{"rowcount": cursor.rowcount}]
            return list(cursor.fetchmany(row_limit))
    finally:
        conn.close()


def _execute_redis(
    spec: dict[str, Any],
    credentials: dict[str, str],
    statement: str,
    timeout_ms: int,
) -> Sequence[Any]:
    try:
        import redis
    except ImportError as exc:
        raise RuntimeError("redis driver is not installed in the runner image") from exc

    parts = statement.split()
    if not parts:
        raise ValueError("Redis command is empty")
    client = redis.Redis(
        host=str(spec["host"]),
        port=int(spec["port"]),
        password=credentials.get("password") or None,
        db=int(spec["database"]) if spec.get("database") not in (None, "") else 0,
        socket_timeout=max(timeout_ms / 1000, 0.1),
        ssl=spec.get("tls") != "disable",
        decode_responses=True,
    )
    try:
        result = client.execute_command(*parts)
    finally:
        client.close()
    return [{"result": result}]


def _execute_mongodb(
    spec: dict[str, Any],
    credentials: dict[str, str],
    statement: str,
    row_limit: int,
    timeout_ms: int,
) -> Sequence[Any]:
    try:
        from pymongo import MongoClient
    except ImportError as exc:
        raise RuntimeError("mongodb driver is not installed in the runner image") from exc

    user = spec.get("username") or ""
    password = credentials.get("password") or ""
    auth = f"{user}:{password}@" if user or password else ""
    tls_flag = "false" if spec.get("tls") == "disable" else "true"
    uri = f"mongodb://{auth}{spec['host']}:{spec['port']}/?tls={tls_flag}"
    client = MongoClient(uri, serverSelectionTimeoutMS=timeout_ms)
    try:
        database = client[str(spec.get("database") or "agent")]
        tokens = statement.split(None, 2)
        command = tokens[0].lower() if tokens else "find"
        collection_name = tokens[1] if len(tokens) > 1 else "documents"
        payload = json.loads(tokens[2]) if len(tokens) > 2 else {}
        collection = database[collection_name]
        if command == "find":
            return list(collection.find(payload).limit(row_limit))
        if command == "aggregate":
            pipeline = payload if isinstance(payload, list) else [payload]
            return list(collection.aggregate(pipeline))
        if command == "count":
            return [{"count": collection.count_documents(payload)}]
        if command == "distinct":
            field = str(payload.get("field") or "_id")
            return [{"values": collection.distinct(field)}]
        if command == "listCollections":
            return [{"name": name} for name in database.list_collection_names()]
        raise ValueError(f"Unsupported MongoDB command: {command}")
    finally:
        client.close()
