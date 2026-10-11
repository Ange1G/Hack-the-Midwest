# Implementation: Agent execution MVP

## What was implemented

- Nested connectors copy under `api/src/app/api/api/` was merged into canonical `api/src/app/` and `api/tests/`; the duplicate tree was removed. Migration `003_connectors` is in `api/alembic/versions/`.
- `agent_executions` table (Alembic `004`) and `app/domains/executions/`: enqueue (`202`), list, get, internal complete callback.
- DB-polled worker (`app/worker/`, `uv run agent-worker`) with `LocalDockerRunner` and `ContainerRunner` for tests.
- Stub image replaced by the full Strands + OpenAI runner (see `spec/2026-10-10-strands-openai-runner/`).
- Callback token is SHA-256 hashed at rest. Completing a terminal execution with a valid token is idempotent.

## Decisions

- PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED` is the MVP queue; a durable broker is still required before production scale with multiple workers.
- Callback URL defaults to `http://host.docker.internal:8000`. The worker always passes `--add-host=host.docker.internal:host-gateway`.
- API handlers only insert `queued` rows. Docker lifecycle lives in the worker. The container reports completion; the worker reconciles timeout / missing callback / non-zero exit.

## Tests

Unit suite: **141 passed** (as of HTTP tools + SSL CA bundle phases).

Integration tests require Compose Postgres (`agent_platform_test` database):

```bash
cd api
docker compose up -d
docker compose exec postgres psql -U postgres -c "CREATE DATABASE agent_platform_test;"
uv run pytest
```

## End-to-end verification (local, 2026-10-10)

Full pipeline verified manually:

1. `POST /api/v1/connectors/sso-user-a` → connector created
2. `POST /api/v1/agents/sso-user-a` → agent created with `systemPrompt: "Say hello in one sentence."`
3. `POST /api/v1/agents/sso-user-a/{agent_id}/executions` → `202` / `status: queued`
4. Worker claimed row, launched `agent-platform-runner:local`
5. Container called OpenAI (`gpt-4o-mini`), POSTed callback
6. `GET /api/v1/agents/sso-user-a/executions/{id}` → `status: succeeded`, `result.output` confirmed
7. Total wall time: ~5 seconds from enqueue to `succeeded`

## Known limitations

- No retries, cancellation, or production container scheduler.
- Linux hosts rely on `host-gateway`; callback reachability must be verified on the target OS.
- Fresh databases need migrations `001` → `004`. Environments that only applied `001` must apply `002` and `003` before `004`.
- `DOCKER_ENABLED=false` refuses to start the worker; tests inject `FakeCallbackRunner` instead of Docker.
- On hosts with TLS-intercepting proxies, `EXECUTION_SSL_CA_BUNDLE` must be set. See `spec/2026-10-10-ssl-ca-bundle/`.
