# Implementation: Per-run execution input

**Status:** Implemented.

## What landed

- Optional `POST .../executions` body `ExecutionCreate { input }` (max 20,000 chars; blank → null).
- Nullable `agent_executions.input` column (Alembic `005_execution_input`).
- Worker passes `RUN_INPUT` into the runner; `run_turn` uses it as the user message when non-empty.
- GET execution returns `input`. Callback `result` does not echo it.

## Validation

```bash
cd api && uv run pytest tests/unit/test_execution_create.py tests/unit/test_execution_service.py tests/unit/test_runner_agent_run.py tests/unit/test_docker_runner.py tests/integration/test_executions_api.py tests/integration/test_execution_worker.py -q
```
