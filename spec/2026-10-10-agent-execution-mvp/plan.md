# Plan: Agent execution MVP

## Queue decision

PostgreSQL job queue on `agent_executions` using `SELECT … FOR UPDATE SKIP LOCKED`.
No Redis/Celery in this slice. Production must replace this with a durable broker before scale
(see [AGENTS.md](../../AGENTS.md) distributed task queue).

Akamai later: keep the same rows and callback contract; replace `LocalDockerRunner` only.

## Flow

1. Authenticated caller `POST /api/v1/agents/{user_sso}/{agent_id}/executions` → row `queued`, HTTP `202`.
2. Worker claims one queued row, sets `running`, stores SHA-256 of a one-time callback token.
3. Worker `docker run`s `agent-platform-runner:local` with callback URL, token, and a minimal agent manifest (no secrets).
4. Container `POST /api/v1/internal/executions/{id}/complete` with `X-Execution-Callback-Token`.
5. API stores `succeeded`/`failed` + `result` / error. Worker reconciles timeout or missing callback.

## Schema (`004_agent_executions`)

`agent_executions`: `id`, `agent_id` FK cascade, `owner_user_sso`, `status`, `result` JSONB,
`error_code`, `error_message`, `callback_token_hash`, `started_at`, `finished_at`, timestamps,
`runner_meta` JSONB. Indexes on `(owner_user_sso, created_at)` and `(status, created_at)`.

Statuses: `queued` → `running` → `succeeded` | `failed` | `timed_out`.

## Modules

```text
app/domains/executions/     persistence, user APIs, internal callback
app/worker/                 poll loop, ContainerRunner, LocalDockerRunner
runner/                     stub image that POSTs a sample result
```

## Local networking

Default `EXECUTION_CALLBACK_BASE_URL=http://host.docker.internal:8000`.
Linux Docker: `--add-host=host.docker.internal:host-gateway`.
API and worker run on the host; Compose still only needs Postgres for the default workflow.
