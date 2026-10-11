# Task: Per-run execution input

## Problem

[`POST .../executions`](../../api/src/app/domains/executions/router.py) accepts no body. The runner always uses a fixed user message in [`agent_run.py`](../../runner/agent_run.py), so operators cannot pass a task-specific prompt per run. This blocks webhooks, chain handoff, and useful manual runs.

**Depends on:** Stable single-agent execution (HTTP tools shipped; DB/MCP slices independent but should land before chains).

## Goals

1. Optional request body on enqueue: `input` (bounded string).
2. Persist input on `agent_executions` (dedicated column or `run_context` JSONB).
3. Worker passes input to runner; runner uses it as the Strands user message when non-empty.
4. Callback `result` unchanged shape; input not echoed unless product explicitly wants it (default: omit from result).

## Constraints

- Max length enforced at API and DB (align with `MAX_SYSTEM_PROMPT_LENGTH` or separate limit, documented).
- Input is untrusted: do not log full text at info level; no special casing that bypasses tool permissions.
- Owner auth unchanged.

## Acceptance criteria

1. POST with `input` → succeeded run whose output reflects the input (integration test with mocked LLM or stub runner).
2. POST without body → same behavior as today (default user line).
3. Oversized input → 422 with field path.
4. Migration applied; existing rows nullable.

## Out of scope

Chain orchestration (uses same field), scheduler, webhooks, frontend (optional thin follow-up in dashboard spec).
