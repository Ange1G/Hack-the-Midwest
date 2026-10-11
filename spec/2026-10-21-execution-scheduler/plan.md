# Plan: Schedule-driven execution enqueue

## 1. Domain helper

- `app/scheduler/match.py`: pure functions—given `now`, `AgentConfigurations`, return whether to fire and slot id for dedupe.
- Reuse validation rules from agent create (already in Pydantic).

## 2. Scheduler loop

- `app/scheduler/loop.py`: poll interval from settings; query agents with schedule JSON non-empty (indexed query or JSONB filter—keep MVP simple: paginated scan with reasonable cap).
- For each match: `ExecutionService.enqueue` via internal session (system actor or service method without HTTP).

## 3. Dedupe

- Table `scheduled_execution_fires` (`agent_id`, `slot_key`, `fired_at`) or unique constraint on (`agent_id`, `slot_key`) per day.

## 4. CLI

- `pyproject.toml` script `agent-scheduler` mirroring `agent-worker`.

## 5. Config

- `SCHEDULER_POLL_INTERVAL_SECONDS`, `SCHEDULER_TIMEZONE` (default UTC).

## 6. Tests

- Unit: match logic for dayOfWeek, timeOfDay, month edge cases.
- Integration: insert agent, freeze time, assert execution row created.

## Validation

```bash
cd api && uv run pytest tests/unit/test_scheduler_match.py -q
```
