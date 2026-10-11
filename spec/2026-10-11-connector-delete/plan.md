# Plan: Connector delete

## Architecture

Mirrors the existing webhook/chain delete pattern throughout the stack.

```
DELETE /api/v1/connectors/{sso}/{id}
  → router.delete_connector
  → ConnectorsController.delete
  → ConnectorService.delete_connector
      ├─ ensure_caller_owns
      ├─ agents.detach_connector(sso, id)   # strips key from configurations.primitives JSONB
      └─ connectors.delete_owned(sso, id)   # deletes row; secrets cascade
```

## Backend

### `AgentRepository`

New method in protocol and `SqlAlchemyAgentRepository`:

```python
async def detach_connector(self, owner_user_sso: str, connector_id: uuid.UUID) -> int
```

- Selects agents where `configurations->'primitives'` has the connector key
  using SQLAlchemy's JSONB `has_key` (`Agent.configurations["primitives"].has_key(str(connector_id))`).
- Iterates results, pops the key, flushes. Single session with the caller's outer transaction.
- Returns updated count (for logging, not exposed to HTTP clients).

### `ConnectorRepository`

New method in protocol and `SqlAlchemyConnectorRepository`:

```python
async def delete_owned(self, owner_user_sso: str, connector_id: uuid.UUID) -> bool
```

Matches `SqlAlchemyWebhookRepository.delete_owned`: fetch by id+owner, `session.delete`, `commit`,
return `False` if missing/wrong owner.

### `ConnectorService`

```python
async def delete_connector(
    self, owner_user_sso: str, connector_id: uuid.UUID, *, caller: CurrentUser
) -> None
```

Requires `AgentRepository` added to `__init__`. Calls `ensure_caller_owns`, then
`agents.detach_connector`, then `connectors.delete_owned`; raises `NotFoundError` on `False`.

### Wiring

`get_connectors_controller` in `deps.py` gets `SqlAlchemyAgentRepository(session)` so the service
has both repos.

### Route

```python
@router.delete("/{user_sso}/{connector_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connector(user_sso, connector_id, controller, caller): ...
```

## Frontend

### `queries.ts`

`useDeleteConnector()` mutation: `api.delete(...)`, invalidate `queryKeys.connectors`.

### `connector-list.tsx`

Add `DataTableActionsCell` / `DataTableActionButton` / `Trash2Icon` actions column — same as
`webhook-list.tsx`.

### MSW mock (`handlers.ts`)

```
http.delete(url("/connectors/:sso/:id"), ...)
```

Ownership checks → remove from `mockState.connectors` → detach from agent primitives → 204.

## Tests

- `test_connector_service.py`: 3 new unit cases (happy path, forbidden, not-found), fake repos.
- `test_connectors_api.py`: integration for 204, agent-detach cascade, 404, 403, 401.
- `connector-list.test.tsx`: seed connector, click delete action, assert row removed.

## Decisions

- Agent detach is best-effort within the same transaction. If the agent update fails, the whole
  delete fails and the connector is preserved.
- Provisioned DB container cleanup is out of scope (tracked in task.md constraints).
