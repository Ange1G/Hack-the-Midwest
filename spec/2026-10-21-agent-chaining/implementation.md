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
cd api && uv run pytest tests/unit/test_chain_service.py tests/unit/test_chain_handoff.py tests/unit/test_chain_orchestrator.py tests/integration/test_chains_api.py tests/integration/test_chain_runs_api.py -q
cd fe && npm test && npm run typecheck && npm run check
```
