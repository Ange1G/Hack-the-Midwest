# Task: Agent execution MVP (queue, Docker stub, callback)

## Problem

Users can create agents and connectors, but there is no way to run an agent. Long-running work must happen outside the API request lifecycle, in an isolated Docker container. The first slice must prove the plumbing: enqueue a run, start a local container, wait until it finishes, and persist results posted back to the API.

## Goals

- `POST /api/v1/agents/{user_sso}/{agent_id}/executions` enqueues a run and returns immediately (`202`).
- A worker process claims queued executions from PostgreSQL and starts a local Docker container.
- The container POSTs a result to an internal callback; the API stores status and output.
- Callers can inspect a run and list execution history for their own agents.
- Local Docker is the runner; the same execution rows and callback contract are the Akamai swap point later.

## Constraints

See [AGENTS.md](../../AGENTS.md). In addition:

- Handlers must not run the agent synchronously.
- User agents must not receive the Docker socket, host credentials, or other users' data.
- Callback authentication uses a per-execution token (hashed at rest), not the caller's SSO header.
- MVP queue: PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED`. A durable broker comes before production scale.
- This slice is plumbing-first: the image is a stub that POSTs a sample result. No Strands, LLM, or connector credential injection.

## Acceptance criteria

1. After connectors are the canonical agent model, creating a connector and an agent that references it still works.
2. `POST …/executions` returns `202` with an execution id and does not wait for the run to finish.
3. With the worker and stub image running locally, an execution reaches `succeeded` and `result` contains the stub payload.
4. `GET …/executions/{id}` returns terminal status and result; a caller whose SSO does not match the path receives `403`.
5. Callback without a valid token returns `401`; oversized or invalid bodies return `422`.
6. Completing an already-terminal execution with a valid token is idempotent (`200`, current state).
7. Alembic `004` applies cleanly; pytest passes without Docker; the Docker path is documented.

## Out of scope

AWS Strands inside the image, decrypted connector credentials, HTTP/MCP tool execution, Redis/Celery, retries/backoff, security monitoring jobs, Akamai remote scheduling, production SSO.
