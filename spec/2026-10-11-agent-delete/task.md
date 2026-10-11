# Task: Agent delete endpoint and UI

## Problem

Agents can be created, listed, retrieved, and patched but not deleted. Users have no way to
remove agents they no longer need. The API has GET/POST/PATCH but no DELETE. The agent list
Delete button announces "not available yet".

**Depends on:** `spec/2026-10-10-table-02-actions/`, `spec/2026-10-21-agent-chaining/`

## Goals

1. `DELETE /agents/{user_sso}/{agent_id}` removes the agent and cascades:
   - `agent_executions`, `agent_memories`, `scheduled_execution_fires`, and
     `webhooks.target_agent_id` are removed by existing FK `ondelete=CASCADE`.
   - Other of the owner's agents whose `configurations.delegates` lists the deleted id
     have that id removed (JSONB array).
   - Provisioned `lifecycle: agent` Docker databases are **not** torn down on delete
     (follow-up, same deferral as connector delete).
2. Agent is blocked from deletion when it is a step in any of the owner's chains
   (`agent_chain_steps.agent_id` FK is `ondelete=RESTRICT`).
3. Agent list Delete button performs the real delete with success/error toasts.

## Constraints

- Ownership enforced by existing `_ensure_caller_may_access`.
- Delete of another user's agent or a missing agent returns 404 (no existence leak).
- Active runs that already loaded the agent configuration are not affected (snapshot semantics).
- Provisioned Docker database containers are **not** torn down on delete (deferred).

## Acceptance criteria

1. `DELETE /api/v1/agents/{user_sso}/{agent_id}` returns **204** when the agent exists
   and belongs to the caller.
2. Returns **404** when the agent is not found or belongs to another user.
3. Returns **403** when `user_sso` ≠ caller identity; **401** without authentication.
4. Returns **409** (`agent_in_use`) when the agent is a step in any of the caller's chains.
5. Before removing the agent row, all of the caller's other agents that list the deleted id
   in `configurations.delegates` have that id removed (other fields preserved).
6. Agent list Delete button removes the agent and shows a success toast; error toast on failure.
7. Delete is disabled while the agent has an active run.
8. Integration tests for 204, 404 (missing and cross-tenant), 403, 401, 409 (chain guard),
   and delegate detach cascade.
9. Unit tests for the service layer (happy path, authz, not-found, chain guard, detach).
10. Vitest test confirming delete removes the row and shows a success toast.
