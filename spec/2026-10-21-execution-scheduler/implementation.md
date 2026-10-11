# Implementation: Schedule-driven execution enqueue

**Status:** Implemented.

## What landed

- Pure matcher in `app/scheduler/match.py` (JS weekday, minutes after midnight, optional month).
- `agent-scheduler` process polls agents and enqueues via `ExecutionService` as the owner.
- `scheduled_execution_fires` unique `(agent_id, slot_key)` prevents double enqueue; failed enqueue releases the slot.
- Timezone: `SCHEDULER_TIMEZONE` (default UTC).

## Validation

```bash
cd api && uv run pytest tests/unit/test_scheduler_match.py tests/integration/test_scheduler.py -q
```
