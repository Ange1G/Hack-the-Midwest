# Plan: Database connectors at execution time

**Depends on:** [2026-10-10-database-connectors](../2026-10-10-database-connectors/plan.md) (runtime + provisioner already implemented).

**Blocks:** None for Phase 2; chaining benefits from stable per-step DB lifecycle later.

## 1. Worker ([`api/src/app/worker/loop.py`](../../api/src/app/worker/loop.py))

- After claim, before `runner.run`:
  - Instantiate `DatabaseProvisioner` (same as CLI).
  - `async with agent_databases(agent, connectors=..., cipher=..., provisioner=...) as dbs:` for entire container lifecycle.
- Extend `ClaimedJob` / `RunRequest` with `database_tools` + `database_credentials` (or single `DATABASE_BUNDLE_JSON` env).
- On `AgentDatabaseError`, fail execution without starting container.

## 2. Bundle builder

- New module or extend [`bundle.py`](../../api/src/app/worker/bundle.py): for each referenced `database` connector, emit tool spec from `DatabaseConnection.describe()` + connection params for runner (host, port, engine, tls flags, read_only; password in credentials map only).
- Skip non-database primitives (HTTP handled separately; MCP later).

## 3. Docker env ([`docker_runner.py`](../../api/src/app/worker/docker_runner.py))

- Add env vars parallel to HTTP: `DATABASE_TOOLS_JSON`, `DATABASE_CREDENTIALS_JSON` (documented in api/README).

## 4. Runner ([`runner/`](../../runner/))

- `db_tools.py`: Strands `@tool` per connector name; parameterized queries with row cap + timeout from connector `options`.
- Read-only: reject non-SELECT or use read-only transaction mode per engine.
- Wire in [`entrypoint.py`](../../runner/entrypoint.py) alongside HTTP tools.

## 5. Tests

- Unit: bundle building, read-only guard, env serialization (no secrets in manifest fields).
- Unit: worker loop with fake provisioner + fake runner (DB context entered/exited).
- Integration: optional `RUN_DOCKER_TESTS=1` path reuses patterns from [`tests/docker`](../../api/tests/docker).
- Reuse [`test_agent_databases.py`](../../api/tests/unit/test_agent_databases.py) patterns.

## 6. Docs

- Update [api/README.md](../../api/README.md) worker section: worker now calls `agent_databases`.
- Record network assumptions (`DATABASE_PROVISIONER_NETWORK`, `host.docker.internal`).

## Validation

```bash
cd api && uv run pytest tests/unit/test_agent_databases.py tests/unit/test_execution_service.py -q
# plus new tests; integration with worker when added
```
