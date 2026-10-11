# Plan: Per-run execution input

**Blocks:** [2026-10-21-webhook-triggers](../2026-10-21-webhook-triggers/task.md), [2026-10-21-agent-chaining](../2026-10-21-agent-chaining/task.md) (step handoff uses same mechanism).

## 1. API

- [`executions/schemas.py`](../../api/src/app/domains/executions/schemas.py): `ExecutionCreate` with optional `input`.
- [`executions/router.py`](../../api/src/app/domains/executions/router.py): accept body on POST.
- [`ExecutionService.enqueue`](../../api/src/app/domains/executions/service.py): persist on create.

## 2. Database

- Alembic migration: `agent_executions.input` TEXT nullable (or JSONB `run_context` if chaining prefers one column—document choice in implementation).

## 3. Worker

- [`ClaimedJob`](../../api/src/app/worker/loop.py): include `run_input` from execution row.
- [`RunRequest`](../../api/src/app/worker/runner.py) + [`docker_runner.py`](../../api/src/app/worker/docker_runner.py): `RUN_INPUT` env (truncate if ever needed at bundle layer).

## 4. Runner

- [`agent_run.run_turn`](../../runner/agent_run.py): accept `user_message` parameter; [`entrypoint.py`](../../runner/entrypoint.py) reads env.

## 5. Tests

- Integration: `test_executions_api.py` enqueue with input.
- Unit: schema max length, service stores field.

## Validation

```bash
cd api && uv run pytest tests/integration/test_executions_api.py -q
```
