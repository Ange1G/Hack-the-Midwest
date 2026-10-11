# Implementation: Agent memory and delegate agents

Status: implemented; awaiting human review (it touches agent execution permissions).

## What shipped

### Memory

- Table `agent_memories` (migration `011_knowledge_memory`): unique on `(agent_id, key)`, `value` stored as JSONB, cascade-deleted with the agent.
- Limits: 50 keys per agent, 4 KB per value, 50 writes per run, and keys must match `^[A-Za-z0-9_.:\-]{1,64}$`.
- `configurations.memory: true` enables it. When memory is off, the field is left out of stored configurations, so existing agents are unchanged.
- **Worker.** It loads the agent's entries into the run context on stdin. The runner exposes `memory_list`, `memory_get`, `memory_set` and `memory_delete`, all backed by an in-container `MemoryStore`.
- **Writes.** The runner reports `memory: {set, delete}` only in a succeeded callback. A failed callback that carries memory is rejected with 422.
- **Applying writes.** The API locks the execution row (`SELECT … FOR UPDATE`), stages the writes in the same transaction as the completion, and commits them together. The result records `memory_writes: {set, deleted, dropped}`. New keys past the cap are dropped and listed.
  - Writes from an agent without memory enabled are ignored and logged as a warning.
  - Duplicate callbacks hit the terminal-status early return and never write twice.
- **Endpoints:** `GET /agents/{sso}/{id}/memory`, `DELETE …/memory` (clear all) and `DELETE …/memory/{key}`. All are owner-scoped and return 404 for other users.

### Delegates

- `configurations.delegates` holds up to 5 agent UUIDs. The API returns 422 for agents the caller does not own, for the agent itself, and for duplicates; the error field is `configurations.delegates.N`.
- **Worker.** At claim time it re-checks every delegate and fails the run closed when one is unavailable:
  - `delegate_missing` if a delegate was deleted or is not owned;
  - `delegate_unsupported` if a delegate uses a database connector, because the database tool is not yet scoped per delegate.
- **Run context.** Each delegate's HTTP and MCP specs and knowledge ids go into the run context. Delegate credentials are merged into the existing credential environment variables, keyed by connector id, and are never placed in the run context.
- **Runner.**
  - Exposes one `ask_<slug>` tool per delegate, which runs a nested Strands agent with only that delegate's tools.
  - Budget: 5 delegate calls per run, 4000-character task and 8000-character output.
  - Delegates cannot call further delegates and never get memory tools.

### Frontend

- The agent form has a "Memory and delegates" section: a memory switch, and checkboxes for your other agents (the agent itself is excluded; unchecked boxes are disabled once 5 are chosen).
- The agent detail page shows the delegates list and, when memory is on, a memory panel with each key, its value and last update, a per-key delete, and Clear all.
- Run view: a "Memory updated" note (see the tool-call UX spec).

## Decisions

- **Text values only.** `memory_set` stores the model's value as a string. The JSONB column allows richer values later.
- **One delegation level.** Nested delegation is not supported, which keeps cost and blast radius bounded.

## Tests

- API integration: `test_agent_memory_api.py`, `test_agent_delegates_api.py` and `test_execution_worker_context.py`. They cover:
  - the callback writes, caps, the disabled-agent guard, and failed-callback rejection;
  - cross-user isolation;
  - fail-closed delegate checks.
- API unit: `test_run_context.py` and `test_runner_context_tools.py`.
- FE: `agent-capabilities.test.tsx` (the request payload, self excluded).
- Smoke test: the runner image built, and `_knowledge_tools`, `_memory_tools` and `_delegate_tools` ran under real Strands `@tool` with a fake run context. Seven tools were registered with valid input schemas, memory writes were reported, and the delegate received only its own tools.

## Known limitations

- Delegates with database connectors are refused rather than supported.
- Not yet tested end to end against a live LLM.
