# Implementation: Agent execution MVP

## What was implemented

- Nested connectors copy under `api/src/app/api/api/` was merged into canonical `api/src/app/` and `api/tests/`; the duplicate tree was removed. Migration `003_connectors` is in `api/alembic/versions/`.
- `agent_executions` table (Alembic `004`) and `app/domains/executions/`: enqueue (`202`), list, get, internal complete callback.
- DB-polled worker (`app/worker/`, `uv run agent-worker`) with `LocalDockerRunner` and `ContainerRunner` for tests.
- Stub image in `runner/` POSTs `{ "message": "stub run complete", ... }` to the callback URL.
- Callback token is SHA-256 hashed at rest. Completing a terminal execution with a valid token is idempotent.

## Decisions

- PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED` is the MVP queue; a durable broker is still required before production scale.
- Stub container only; Strands, LLM calls, and connector credential injection are deferred.
- Callback URL defaults to `http://host.docker.internal:8000`. The worker always passes `--add-host=host.docker.internal:host-gateway`.
- API handlers only insert `queued` rows. Docker lifecycle lives in the worker. The container reports completion; the worker reconciles timeout / missing callback / non-zero exit.

## Tests

Observed: `uv run pytest` → **123 passed**, 36 skipped.

Skipped tests are the PostgreSQL integration suite. Docker was not running, so Compose Postgres was not available; a different process on `:5432` rejected `postgres`/`postgres`. Unit tests (including execution service, tokens, callback schema, and docker command construction) passed. Integration tests for enqueue/callback/FakeRunner were not executed against a live database in this environment.

Re-run with Compose Postgres when Docker is available:

```bash
cd api
docker compose up -d
docker compose exec postgres psql -U postgres -c "CREATE DATABASE agent_platform_test;"
uv run pytest
```

Optional Docker E2E is still manual (build `runner/`, run API + worker).

## Known limitations

- No retries, cancellation, or production container scheduler.
- Linux hosts rely on `host-gateway`; callback reachability must be verified on the target OS.
- Fresh databases need migrations `001` → `004`. Environments that only applied `001` must apply `002` and `003` before `004`.
- `DOCKER_ENABLED=false` refuses to start the worker; tests inject `FakeCallbackRunner` instead of Docker.
