# Implementation: Database connectors at execution time

**Status:** Implemented (awaiting step approval).

## What landed

- Worker wraps each claimed run in `agent_databases()` (`api/src/app/worker/loop.py`). Provisioning failures fail the execution with `database_unavailable` and never start the runner container. `lifecycle: run` databases are released after the container exits, including runner errors.
- `build_database_tool_bundle` emits runner specs without passwords; loopback hosts become `host.docker.internal`.
- Docker env: `DATABASE_TOOLS_JSON`, `DATABASE_CREDENTIALS_JSON`.
- Runner `db_tools.py`: deterministic read-only guard for SQL / Redis / MongoDB; Strands tools registered in `entrypoint.py`.

## Validation

```bash
cd api && uv run pytest tests/unit/test_database_tool_bundle.py tests/unit/test_db_tools.py tests/unit/test_docker_runner.py tests/unit/test_http_tool_bundle.py tests/unit/test_agent_databases.py tests/unit/test_execution_service.py tests/integration/test_execution_worker.py tests/integration/test_execution_worker_databases.py -q
```

## Follow-ups (out of scope)

- Production Akamai networking: set `DATABASE_PROVISIONER_NETWORK` so runner and provisioned DBs share an internal Docker network.
- Idle reaper for `lifecycle: agent` databases; teardown on agent delete.
