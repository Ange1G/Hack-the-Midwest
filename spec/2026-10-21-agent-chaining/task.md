# Task: Agent chaining (ordered multi-agent pipelines)

## Problem

Users need pipelines where agent A’s output becomes agent B’s input, in a fixed order, with a full audit trail but a simple UI that shows only the final result.

**Depends on:**

- [2026-10-21-execution-per-run-input](../2026-10-21-execution-per-run-input/task.md) (step handoff and external input).
- Single-agent execution stable (HTTP; DB/MCP as available).

**Integrates with (follow-ups in same or later PRs):**

- [2026-10-21-execution-scheduler](../2026-10-21-execution-scheduler/task.md) — chain-level schedule.
- [2026-10-21-webhook-triggers](../2026-10-21-webhook-triggers/task.md) — `target_type: chain`.

## Goals

1. CRUD **chains**: ordered list of agent IDs (same owner); order = run order.
2. **Chain run**: enqueue pipeline; orchestrator runs step 0..N-1 sequentially using existing `agent_executions` + worker.
3. Handoff: step *i+1* `input` = bounded text from step *i* `result.output`.
4. **Logging:** Persist ordered `chain_run_steps` with links to each `execution_id`, statuses, outputs, tool_calls.
5. **API default:** GET chain run returns **final result only**; GET steps endpoint returns ordered process log.
6. **Frontend:** Chain builder (ordered list); run shows final output; collapsible ordered timeline for steps.

## Constraints

- Fail-fast: failed step fails chain; no subsequent steps.
- Max steps, max handoff bytes, max wall time (configurable).
- Cross-tenant agent IDs in chain rejected at save time.
- Orchestration is deterministic platform code, not LLM routing.

## Acceptance criteria

1. Chain A→B: mock/stub runs produce B input containing A output; chain status `succeeded`; `final_result` matches B output.
2. Failure at step 1: chain `failed`, step 2 never queued.
3. GET run without steps omits intermediate outputs; GET steps returns order `[0,1,...]` matching chain definition.
4. Integration test for orchestrator callback: when step execution completes, next step enqueued (worker hook or polling worker).

## Out of scope

Branching, loops, dynamic next-agent, human approval, parallel steps.
