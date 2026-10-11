# Task: Connector delete endpoint and UI

## Problem

Connectors can be created and listed but not deleted. Users have no way to remove connectors from
the library once they are no longer needed. The API has GET and POST but no DELETE. The connectors
list UI has no row actions.

**Depends on:** `spec/2026-10-10-connectors/`, `spec/2026-10-11-connectors-patch-chain-triggers/`

## Goals

1. `DELETE /connectors/{user_sso}/{connector_id}` removes the connector and cascades:
   - All of the owner's agents that reference the connector id lose that key from
     `configurations.primitives`. Other agent configuration fields are unchanged.
   - `connector_secrets` rows are removed by the existing FK `ondelete=CASCADE`.
2. Connectors list renders a per-row delete action with success/error toasts.

## Constraints

- Ownership enforced on the backend (`ensure_caller_owns`).
- Delete of another user's connector returns 404 (same semantics as webhooks — do not leak existence).
- Active runs that already loaded a connector bundle are not affected (snapshot semantics).
- Provisioned Docker database containers are **not** torn down on delete (follow-up work).

## Acceptance criteria

1. `DELETE /api/v1/connectors/{user_sso}/{connector_id}` returns **204** when the connector exists
   and belongs to the caller.
2. Returns **404** when the connector is not found or belongs to another user.
3. Returns **403** when `user_sso` ≠ caller identity; **401** without authentication.
4. Before removing the connector row, all of the caller's agents with that connector id in
   `configurations.primitives` have that key removed (other fields preserved).
5. Connector list UI shows a trash-icon delete button per row; list refreshes on success.
6. Success and error toasts are shown via `notify`.
7. Unit tests for the service (happy path, authz, not-found) and an integration test for the full
   request lifecycle + agent detach cascade.
8. MSW delete handler and Vitest test for the connector-list delete action.
