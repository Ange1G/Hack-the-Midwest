# Plan: Agent delete endpoint and UI

## Backend

### Repository layer (`api/src/app/domains/agents/repository.py`)

Add two new methods to `AgentRepository` protocol and `SqlAlchemyAgentRepository`:

- **`delete_owned(owner_user_sso, agent_id) -> bool`** — fetches the agent row with
  `get_owned`, deletes it, commits, returns `True`; returns `False` if not found.
- **`detach_delegate(owner_user_sso, delegate_id) -> int`** — finds all of the owner's
  agents whose `configurations` JSONB contains `delegate_id` in the `delegates` array,
  removes it from each, flushes (does not commit; caller commits). Returns count updated.
  Implementation mirrors `detach_connector`: iterate scalars, mutate, flush.

### Chain guard (`api/src/app/domains/chains/repository.py`)

Add **`any_chain_references_agent(owner_user_sso, agent_id) -> bool`** to
`ChainRepository` protocol and `SqlAlchemyChainRepository`. Issues a `SELECT EXISTS`
joining `agent_chain_steps` with `agent_chains` on `owner_user_sso`.

### Service (`api/src/app/domains/agents/service.py`)

Add `delete_agent(owner_user_sso, agent_id, *, caller, chains)`:

1. `_ensure_caller_may_access`
2. If `await chains.any_chain_references_agent(owner_user_sso, agent_id)`:
   raise `AppError(code="agent_in_use", status_code=409, message=...)`
3. `await self._repository.detach_delegate(owner_user_sso, agent_id)` (flush)
4. `deleted = await self._repository.delete_owned(owner_user_sso, agent_id)` (commit)
5. If not deleted: raise `NotFoundError("Agent not found")`

`AgentService.__init__` does not change — `chains` is injected at the call site (service
method parameter, same pattern as `connectors` in `create_agent`/`update_agent`).

### DI (`api/src/app/api/deps.py`)

`get_agents_controller` already receives `AgentService`. The router handler for DELETE
also depends on `get_chain_repository` (already declared for chains feature) to pass to
the controller/service.

### Controller (`api/src/app/domains/agents/controller.py`)

Add `delete(user_sso, agent_id, *, caller, chains)` → `await self._service.delete_agent(...)`.

### Router (`api/src/app/domains/agents/router.py`)

```python
@router.delete("/{user_sso}/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    user_sso: str,
    agent_id: uuid.UUID,
    controller: AgentsController = Depends(get_agents_controller),
    caller: CurrentUser = Depends(get_current_user),
    chains: SqlAlchemyChainRepository = Depends(get_chain_repository),
) -> None:
    await controller.delete(user_sso, agent_id, caller=caller, chains=chains)
```

## Tests

### Integration (`api/tests/integration/test_agents_delete_api.py`)

- `test_delete_agent_returns_204` — create agent, delete, get → 404, absent from list.
- `test_delete_agent_404_for_missing`
- `test_delete_agent_404_for_another_tenants_agent` — create as owner B, delete as owner A.
- `test_delete_agent_403_wrong_path_user`
- `test_delete_agent_401_unauthenticated`
- `test_delete_agent_detaches_from_delegates` — create agent B listing A as delegate,
  delete A, verify B's `configurations.delegates` is empty.
- `test_delete_agent_409_when_in_chain` — create agent and chain with it as a step, delete
  agent → 409, agent still exists.

### Unit (`api/tests/unit/test_agent_service.py`)

Stub repository and chain repository; test service in isolation:
- Happy path: detach called, delete called.
- Forbidden: `_ensure_caller_may_access` raises.
- Not found: `delete_owned` returns False.
- Chain guard: `any_chain_references_agent` returns True → 409.

## Frontend

- `useDeleteAgent()` in `fe/src/lib/api/queries.ts` — mirrors `useDeleteConnector`.
- `agent-list.tsx`: shared delete handler; disable button when `isRunning` or starting;
  wire both card and table Delete buttons; remove `announceDeleteUnavailable`.
- `agent-list.test.tsx`: replace stub assertion with real delete behaviour test.

## Deferred

- Provisioned Docker `lifecycle: agent` database teardown on agent delete.
