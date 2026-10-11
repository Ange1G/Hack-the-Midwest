# Implementation: Agent chaining

**Status:** Implemented.

Sub-PR tracking:

- [x] PR-A: Schema + CRUD
- [x] PR-B: Orchestrator
- [x] PR-C: Frontend

## PR-A (landed)

- Tables `agent_chains` and `agent_chain_steps` (008). Steps unique on `(chain_id, position)`; `agent_id` is RESTRICT on delete.
- Authenticated CRUD: `POST/GET /api/v1/chains/{user_sso}`, `GET/DELETE /api/v1/chains/{user_sso}/{chain_id}`.
- Create body: `title`, ordered `steps` (`agent_id`, optional `label`), optional `schedule` (`dayOfWeek` / `timeOfDay` / `month`).
- All agent IDs must belong to the caller; missing and foreign IDs both `422` `invalid_chain`.
- `MAX_CHAIN_STEPS` (default 10).

## PR-B (landed)

- Tables `chain_runs` and `chain_run_steps` (009).
- `POST /api/v1/chains/{user_sso}/{chain_id}/runs` → 202 `running` run; enqueues step 0.
- `GET .../runs/{id}` returns status + `final_result` only (no step payloads).
- `GET .../runs/{id}/steps` is the ordered audit trail.
- `ExecutionService.complete` advances the chain: success hands off `result.output` (`Previous step output:\\n` + truncate to `MAX_CHAIN_HANDOFF_BYTES`); last success stores `final_result`; failure marks later steps `skipped`.
- Worker `fail_if_running` also notifies the orchestrator so timeouts fail the chain.

## Handoff delivery (follow-up)

- Handoff also appends `Previous step tool results:` plus bounded `tool_calls[].response_body` when present, still under `max_chain_handoff_bytes` (output first, then tools).
- Runner tool summaries (`summarize_call`, MCP, DB) persist `response_body` so JSON pipelines (e.g. fetch → transform) see the HTTP payload, not only the LLM summary.
- Worker injects `RUN_INPUT_B64` instead of raw `RUN_INPUT` so multiline handoff survives `docker run -e`. The runner prefers `RUN_INPUT_B64` and falls back to `RUN_INPUT`.

Not in this slice: scheduler/webhook `target_type: chain`, wall-clock watchdog.

## PR-C (frontend)

See [frontend.md](frontend.md).

- Optional per-run input on agent detail and chain detail; run view shows `input`.
- `/webhooks`: create (secret once + fire URL), list (masked secret), delete.
- `/chains`, `/chains/new`, `/chains/$chainId`: builder with reorder, session run list.
- `/chain-runs/$chainRunId`: poll `final_result`; Process panel fetches `/steps`.
- MSW handlers and Vitest coverage for schemas, hooks, and the new screens.

## Validation

```bash
cd api && uv run pytest tests/unit/test_chain_service.py tests/unit/test_chain_handoff.py tests/unit/test_chain_orchestrator.py tests/unit/test_docker_runner.py tests/unit/test_runner_agent_run.py tests/integration/test_chains_api.py tests/integration/test_chain_runs_api.py tests/integration/test_chain_worker_handoff.py -q
cd fe && npm test && npm run typecheck && npm run check
```
