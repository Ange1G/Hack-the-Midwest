# Plan: Agent chaining

**Ship in sub-PRs if needed:**

1. **PR-A:** Schema + CRUD chains API (no orchestrator).
2. **PR-B:** Chain run enqueue + orchestrator + step linking.
3. **PR-C:** Frontend chain builder + run UX.

## 1. Data model

- `agent_chains` — `id`, `owner_user_sso`, `title`, `schedule` JSONB optional (chain-level; mirrors `AgentConfigurations` schedule shape).
- `agent_chain_steps` — `chain_id`, `position` (unique), `agent_id` FK, optional `label`.
- `chain_runs` — `id`, `chain_id`, `owner_user_sso`, `status`, `input`, `trigger`, `final_result` JSONB, timestamps.
- `chain_run_steps` — `chain_run_id`, `position`, `execution_id` FK nullable until created, `status`, snapshot fields.

Alembic migration(s).

## 2. API (`/api/v1/chains/{user_sso}`)

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `/chains/{user_sso}` | List/create |
| GET/PATCH/DELETE | `/chains/{user_sso}/{chain_id}` | MVP: POST create + GET; PATCH/DELETE optional in PR-A |
| POST | `/chains/{user_sso}/{chain_id}/runs` | Body `{ input? }` → 202 `chain_run` |
| GET | `/chains/{user_sso}/runs/{chain_run_id}` | Summary: status + **final_result only** |
| GET | `/chains/{user_sso}/runs/{chain_run_id}/steps` | Ordered steps + execution details |

Validate all `agent_id`s on create/update belong to owner and exist.

## 3. Orchestrator

Option **A (recommended):** Extend worker after execution callback completes—if execution linked to `chain_run_steps`, enqueue next step or finalize chain.

- `ExecutionService.complete` or repository hook: load `chain_run_step` by `execution_id`.
- If succeeded and not last position: create next `agent_execution` with `input` from prior result; leave chain `running`.
- If succeeded and last: set `chain_runs.status=succeeded`, `final_result=result`.
- If failed: set chain `failed`, record failing step.

Option B: Dedicated `chain-worker` polling `chain_runs`—more moving parts; use only if callback hook is too tangled.

Handoff helper: truncate output, strip secrets, prefix optional context (`Previous step output:\n`).

## 4. Limits

Settings: `max_chain_steps`, `max_chain_handoff_bytes`, `max_chain_wall_seconds` (optional watchdog).

## 5. Scheduler & webhook extensions

- Scheduler: if `agent_chains.schedule` set, enqueue `chain_run` not single agent (small addition to scheduler spec).
- Webhooks: `target_type` + `target_chain_id`; fire → `chain_run` with body as input.

Document in implementation.md when each lands.

## 6. Frontend ([`fe/`](../../fe/))

New spec section or file `spec/2026-10-21-agent-chaining/frontend.md`:

- Route `/chains/new`, `/chains/$chainId` — ordered agent picker (up/down), labels.
- Run chain → poll `chain_run` until terminal; show **final** output card.
- Collapsible **Process** panel: vertical timeline, step index + agent title + status; fetch `/steps` on expand.

## 7. Tests

- Unit: handoff truncation, chain validation, orchestrator state machine.
- Integration: 2-agent chain with stub runner/callback completing steps in sequence.

## Validation

```bash
cd api && uv run pytest tests/integration/test_chain_runs_api.py -q
cd fe && npm test  # when PR-C lands
```
