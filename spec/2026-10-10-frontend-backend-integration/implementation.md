# Implementation

- Merged `origin/main` into `agent-flow` (dashboard UI).
- Added `GET /api/v1/agents/{user_sso}/{agent_id}` so agent detail works against the live API.
- Frontend schemas now match `ExecutionRead` (`result.output`, `error_message`, `timed_out`) and UUID-keyed connector references.
- `useCreateAgent` creates HTTP connectors, then the agent. Runs use `/executions`.
- Agent list/detail/edit join connectors for method and name. Run view shows output, errors, and tool calls. Security page is a stub.
- MSW updated to the same contracts. Vitest: 100 passed.
