# Plan: Connector library, agent PATCH, chain triggers

Ship in four commits on one branch: spec (this directory), backend PATCH, backend chain triggers, frontend.

## 1. Agent PATCH

- `AgentUpdate` in [`api/src/app/domains/agents/schemas.py`](../../api/src/app/domains/agents/schemas.py): optional `title`, `system_prompt`, `configurations`; at least one required.
- `PATCH /api/v1/agents/{user_sso}/{agent_id}` reuses `_connector_reference_errors`.
- Full replace of `configurations` when present (not a deep merge).

## 2. Webhook chain targets

- Migration `010_webhook_chain_targets`: `target_type`, nullable `target_agent_id` / `target_chain_id`, CHECK one target.
- Create/read schemas become discriminated on `target_type`.
- Fire: agent → `ExecutionService.enqueue`; chain → `ChainService.enqueue_run`. Response data is the created resource (`ExecutionRead` or `ChainRunRead`).

## 3. Scheduler chain fires

- Generalize `matching_slot` to accept `dayOfWeek` / `timeOfDay` / `month`.
- Scan chains with non-empty `schedule.timeOfDay`.
- Dedupe table `scheduled_chain_fires` (`chain_id`, `slot_key`).
- Enqueue via `ChainService.enqueue_run` with `trigger=scheduler`.

## 4. Frontend

- `/connectors` list + `/connectors/new` typed forms (HTTP, MCP, database).
- Agent form: pick existing connectors only; MCP `allowedTools`; edit saves via PATCH.
- Webhook form: Agent | Chain target.

## Validation

```bash
cd api && uv run pytest tests/integration/test_agents_api.py tests/integration/test_webhooks_api.py tests/unit/test_scheduler_match.py -q
cd fe && npm test && npm run typecheck
```
