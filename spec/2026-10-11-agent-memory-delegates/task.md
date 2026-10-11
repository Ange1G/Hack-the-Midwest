# Task: Agent memory and delegate agents

## Problem

Each run starts from zero, so agents cannot track what changed since last time (page watchers, digests). Agents also cannot hand sub-tasks to specialist agents the user already built.

## Goals

### Memory

1. `configurations.memory: boolean` (default false) enables a per-agent key/value store.
2. The worker loads the agent's memory into the run context; the runner exposes `memory_list`, `memory_get(key)`, `memory_set(key, value)`, `memory_delete(key)`.
3. The runner reports writes in the success callback (`memory: {set, delete}`). The API validates them and applies them in the same transaction that marks the run succeeded. Failed runs and agents without memory enabled write nothing.
4. `GET /api/v1/agents/{sso}/{agent_id}/memory`, `DELETE …/memory/{key}`, `DELETE …/memory` (clear). Owner-scoped.

### Delegates

5. `configurations.delegates: uuid[]` (max 5, unique) lists other agents of the same owner this agent may call. Not itself.
6. The runner exposes one `ask_<slug>(task)` tool per delegate that runs a nested Strands agent with the delegate's own prompt and HTTP, MCP and knowledge tools (allowlists applied as for a normal run). Nested delegates are not followed (depth 1). A delegate with database connectors fails the run closed (`delegate_unsupported`) because databases are provisioned per run for the parent only.
7. At most 5 delegate calls per run; each result is truncated to 8000 characters.

## Limits

Memory: 50 keys per agent, key pattern `^[A-Za-z0-9_.:-]{1,64}$`, value is JSON up to 4096 bytes serialized, at most 50 sets and 50 deletes per callback.

## Acceptance criteria

1. Memory writes from a succeeded run are persisted; a failed run's are not; duplicate callbacks do not double-apply (terminal early return).
2. Memory writes are ignored when `configurations.memory` is false, even if the container sends them.
3. Over-limit or malformed memory payloads are rejected with 422 by the callback schema.
4. When the key cap is reached, new keys are dropped and listed under `result.memory_writes.dropped`.
5. Saving an agent with a delegate that is missing, owned by someone else, or itself returns 422 with a field path.
6. The run fails with `delegate_missing` if a delegate was deleted after saving.
7. Delegate tool calls appear in `result.tool_calls` with `kind: "delegate"`; nested calls carry `delegate: <title>`.

## Out of scope

Shared memory across agents, vector memory, memory TTLs, async delegate executions, deeper delegate trees.
