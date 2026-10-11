# Plan

1. Merge `origin/main` into `agent-flow` so the dashboard UI is on this branch.
2. Align `fe/src/lib/api/schemas.ts` with `ExecutionRead`, `ConnectorRead`, and UUID-keyed `configurations.primitives`. Keep form input as named HTTP contracts.
3. Point queries at `/connectors` and `/executions`. `useCreateAgent` creates connectors first.
4. Join connectors in the agent list, detail, and read-only edit form.
5. Update MSW to the same paths and shapes so unit tests still run without the API.
6. Stub the security route. Add backend GET-agent-by-id (required by the detail page).
7. Validate with Vitest (and the browser against a live API when available).
