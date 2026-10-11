# Frontend: agent-flow API parity

Covers the frontend slice of per-run input, webhook CRUD, and chain CRUD + sequential runs. Connector library, agent PATCH, webhook/scheduler targeting of chains, and security findings stay deferred.

## Routes

| Path | Screen |
|------|--------|
| `/agents/$agentId` | Optional run input on "Run agent" |
| `/runs/$runId` | Shows `execution.input` when present |
| `/webhooks` | Create/list/delete webhooks |
| `/chains` | Chain list |
| `/chains/new` | Ordered agent builder |
| `/chains/$chainId` | Detail, optional input, "Run chain" |
| `/chain-runs/$chainRunId` | Poll `final_result`; collapsible Process timeline |

There is no `GET /chains/{user_sso}/{id}/runs` list. The chain detail "Runs this session" table is a TanStack Query cache of runs started in this browser session.

## Contracts

- `POST .../executions` and `POST .../chains/.../runs` accept `{ input? }` (trimmed, max 20,000).
- Webhook create returns the HMAC secret once. List responses use `********`.
- Fire URL is `{API_BASE_URL}/hooks/{id}`. Integrators send `X-Webhook-Signature: sha256=<hex>` of the raw body.
- Chain run GET is the summary (`status` + `final_result`). Steps load only when Process is opened.

## Mock

MSW mirrors the backend: masked webhook secrets, execution input, chain CRUD, and orchestrator advance on execution completion (handoff prefix `Previous step output:\n`).

## Deferred

- MCP/database connector library UI
- Agent edit/save (PATCH)
- Webhook or scheduler `target_type: chain`
- Security findings UI
