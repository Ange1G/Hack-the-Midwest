# Task: Schedule-driven execution enqueue

## Problem

Agents store schedule fields in `configurations` (`dayOfWeek`, `timeOfDay`, `month`) per [AgentConfigurations](../../api/src/app/domains/agents/configurations.py), but no process enqueues executions when those times occur.

**Depends on:** [2026-10-21-execution-per-run-input](../2026-10-21-execution-per-run-input/task.md) (scheduled runs may pass empty input).

**Later extension:** [2026-10-21-agent-chaining](../2026-10-21-agent-chaining/task.md) adds chain-level schedules.

## Goals

1. Long-lived **scheduler** process (separate CLI entry point, e.g. `agent-scheduler`) that polls agents with non-empty schedules.
2. At matching slot, call existing enqueue path (same limits as manual run).
3. Idempotency: at most one enqueue per agent per schedule slot (dedupe key / DB table).
4. Timezone policy documented and implemented (MVP: UTC or single `SCHEDULER_TIMEZONE` env).

## Constraints

- Must not block API request threads.
- Respect `max_active_executions_per_owner`.
- Only agents owned by valid rows; no cross-tenant enqueue.

## Acceptance criteria

1. Unit test: given frozen clock and agent with `timeOfDay: [540]`, scheduler enqueues once on Monday 09:00 UTC (or configured TZ).
2. Same slot within dedupe window does not double-enqueue.
3. Agent with empty schedule never enqueued.
4. Document how to run scheduler beside worker in api/README.

## Out of scope

Chain schedules (follow-up in chaining spec), frontend calendar UI, cron expressions beyond existing fields.
