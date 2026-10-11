# Task: Agent creation, typed configurations, and the HTTP contract

## Problem

The agents API can list agents but not create them. `configurations` is an untyped JSON object, the HTTP tool contract agreed by the team has no implementation, and there is no safe place to keep the credentials (`xApiKey`, `authorizationHeader`) that HTTP contracts carry. Storing them inside `configurations` would expose them through the existing `GET /api/v1/agents/{user_sso}` response, violating [AGENTS.md](../../AGENTS.md) ("Secrets and credentials ... must never be exposed in ... client responses").

## Goals

- `POST /api/v1/agents/{user_sso}` creates an agent owned by the authenticated caller.
- `configurations` is validated against an explicit schema: `primitives`, `month`, `dayOfWeek`, `timeOfDay`.
- Each entry in `configurations.primitives` is an HTTP contract, validated at save time.
- Credentials in HTTP contracts are stored encrypted, separately from `configurations`, and never returned to clients.

## Agreed contracts (team spec, 2026-10-10)

HTTP contract:

```text
{
  method: string,
  URL: string,
  payload?: JSON | null,
  xApiKey?: string | null,
  authorizationHeader?: string | null,
  contractVersion: int,
  options?: { retries?: int | null /* max 5 */, timeout?: int | null /* ms */ } | null
}
```

Agent `configurations` (JSONB): `{ primitives: {...}, month: int, dayOfWeek: int[], timeOfDay: int[] }`

POST body: `{ agentTile: str, configurations: {...}, systemPrompt: str }`

## Constraints

See [AGENTS.md](../../AGENTS.md). In addition, for this change:

- **Additive only.** Existing source lines are not edited or removed; new behavior lives in new modules and appended code. Existing tests must keep passing unchanged.
- Owner is taken from the authenticated caller, never from the request body.

## Acceptance criteria

1. `POST /api/v1/agents/{user_sso}` returns `201` with `ApiEnvelope[AgentRead]` (same shape as list items) for a valid body.
2. The created agent appears in `GET /api/v1/agents/{user_sso}`.
3. Caller SSO ≠ path `user_sso` returns `403`; missing auth returns `401` (same rules as GET).
4. Invalid `configurations` or HTTP contracts return `422` envelopes whose `error.details.errors[]` name the offending field path, never a `500`.
5. HTTP contract validation: `method` ∈ {GET, POST}; `URL` is http/https and not localhost, private, link-local, or cloud-metadata; `contractVersion` = 1; `retries` 0–5; `timeout` 100–60,000 ms; GET has no `payload`; unknown fields rejected.
6. `xApiKey` / `authorizationHeader` values are encrypted at rest in a separate `agent_secrets` table. `configurations` stores `"********"` in their place, so neither POST nor GET responses contain them.
7. If a contract includes credentials but no encryption key is configured, the API returns `503` and stores nothing.
8. Alembic migration `002` creates `agent_secrets`; upgrade, downgrade, and re-upgrade succeed.
9. Existing tests pass unchanged; new unit and integration tests cover the above.

## Out of scope

Executing HTTP contracts (belongs with the task queue / worker feature), update and delete endpoints, production SSO, migrating the existing `schedule_*` columns.
