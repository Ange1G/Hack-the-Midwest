# Plan: Agent memory and delegate agents

## Persistence

Migration `011_knowledge_memory` adds `agent_memories (id, agent_id FK agents ON DELETE CASCADE, owner_user_sso, key, value JSONB, updated_at)` with unique `(agent_id, key)`.

## Run context

The worker sends one JSON document on container stdin (see knowledge plan):

```json
{
  "knowledge": [{"id", "name", "max_results", "documents": [{"id", "title", "body"}]}],
  "memory": {"enabled": true, "entries": {"key": "value"}},
  "delegates": [{"tool_name", "title", "system_prompt", "http_tools", "mcp_servers", "knowledge_ids"}]
}
```

Delegate credentials merge into the existing `HTTP_CREDENTIALS_JSON` / `MCP_CREDENTIALS_JSON` maps (keyed by connector id, same owner), so secrets stay out of stdin and out of tool specs.

## Callback

`ExecutionComplete.memory: MemoryWrites | None` with `set: dict[key, JsonValue]` and `delete: list[key]`. `ExecutionService.complete` stages writes through `MemoryRepository` before `complete_if_running` commits, only when `status == succeeded` and the agent has memory enabled. Result gains `memory_writes: {set, deleted, dropped}`.

## Delegation

- `AgentConfigurations.delegates` validated in `AgentService` (ownership via `AgentRepository.get_owned`, not self).
- Worker: loads delegates, collects connector ids across agent + delegates, builds per-delegate HTTP/MCP bundles with the existing builders, rejects delegate database connectors.
- Runner: `delegate_tools.py` holds naming (`ask_<slug>`, deduplicated) and the call budget; `entrypoint.py` builds nested `strands.Agent` instances on demand.

## Frontend

Agent form: "Memory" switch, delegate checkbox list (other agents). Agent detail: memory panel (entries, delete key, clear) and delegates list. Run view: memory writes line.
