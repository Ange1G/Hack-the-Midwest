# Stragents API

Platform requirements and architecture: [../AGENTS.md](../AGENTS.md) and [../README.md](../README.md) at the repository root.

FastAPI service with async SQLAlchemy and PostgreSQL.

## Prerequisites

- Python 3.14+
- [uv](https://docs.astral.sh/uv/)
- Docker (for local PostgreSQL)

## Setup

```bash
cd api
cp .env.example .env
docker compose up -d
uv sync --group dev
```

Compose publishes Postgres on host port **5433** so it does not clash with a local Postgres on `5432`. If `alembic upgrade head` fails with password errors for user `postgres`, confirm Docker is running and `DATABASE_URL` uses port `5433`.

Create the test database (once):

```bash
docker compose exec postgres psql -U postgres -c "CREATE DATABASE agent_platform_test;"
```

Run migrations:

```bash
uv run alembic upgrade head
```

## Run the API

```bash
uv run uvicorn app.main:app --app-dir src --reload --host 0.0.0.0 --port 8000
```

## Development authentication

When `APP_ENV=development` or `test`, send the caller SSO:

```http
X-Dev-User-SSO: your-sso-id
```

The path `{user_sso}` must match the header or the API returns `403`.

## CORS (dashboard dev server)

The frontend dev server (`http://localhost:3000` by default) calls this API on a
different origin and sends `X-Dev-User-SSO`. Browsers require CORS preflight
(`OPTIONS`) to succeed before those requests run.

When `APP_ENV` is `development` or `test`, allowed origins default to the local
dashboard ports if `CORS_ORIGINS` is unset. In `production`, set `CORS_ORIGINS`
to a comma-separated list of frontend origins (CORS is disabled when empty).

## Example request

```bash
curl -s -H "X-Dev-User-SSO: sso-user-a" \
  "http://localhost:8000/api/v1/agents/sso-user-a?page=1&page_size=20"
```

## Tests

Ensure PostgreSQL is running and `agent_platform_test` exists, then:

```bash
uv run pytest
```

## Connectors

Connectors are reusable primitives (an HTTP endpoint, an MCP server) owned by a user.
Agents reference them by ID, so a credential is configured once and shared.

Every connector follows the generic contract:

```text
{ type, contractVersion, name, description?, options?: { retries, timeout }, credentials?, config }
```

| `type` | `credentials` | `config` |
| --- | --- | --- |
| `http` | `xApiKey`, `authorizationHeader` | `method` (GET/POST), `URL`, `payload`, optional `queryParams` / `bodyParams` |
| `mcp` | `xApiKey`, `authorizationHeader` | `URL`, `transport` (`streamableHttp`) |
| `notification` | `webhookUrl` (required), `xApiKey`, `authorizationHeader` | `bodyParams` (keys the agent fills, e.g. `text`), optional fixed `payload` object |

Notification connectors POST JSON to one destination, such as a Slack incoming webhook.
The destination URL is a credential because such URLs embed a token: it is encrypted,
never returned, and the agent and run view only see its host. The agent gets a
`<name>(body)` tool that accepts only the `bodyParams` keys
(`spec/2026-10-11-notification-connector/`).

List connector types and their JSON Schemas: `GET /api/v1/connector-types`.

Create one:

```bash
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/connectors/sso-user-a" \
  -d '{
    "type": "mcp",
    "contractVersion": 1,
    "name": "linear",
    "description": "Team Linear workspace",
    "credentials": { "authorizationHeader": "Bearer <token>" },
    "config": { "URL": "https://mcp.linear.example.com/mcp" }
  }'
```

List yours: `GET /api/v1/connectors/sso-user-a?page=1&page_size=20`.

Preview tools on an MCP connector (live `tools/list`):

```bash
curl -s -H "X-Dev-User-SSO: sso-user-a" \
  "http://localhost:8000/api/v1/connectors/sso-user-a/<connector-id>/tools"
```

### Credentials

Everything under `credentials` is encrypted with `SECRETS_ENCRYPTION_KEY`, stored in
`connector_secrets`, and returned as `"********"`. Generate a key and put it in `.env`
(never commit it):

```bash
uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Without a key, connectors without credentials still work; creating one with credentials
returns `503`. Losing or changing the key makes stored credentials unreadable.

## Create an agent

`configurations.primitives` maps your connector IDs to how this agent may use them.
MCP references must list `allowedTools`; HTTP references must not.

```bash
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/agents/sso-user-a" \
  -d '{
    "agentTitle": "Weekday digest",
    "systemPrompt": "Summarize new issues from the last day.",
    "configurations": {
      "primitives": {
        "<linear connector id>": { "allowedTools": ["search_issues", "get_issue"] }
      },
      "dayOfWeek": [1, 2, 3, 4, 5],
      "timeOfDay": [540]
    }
  }'
```

`dayOfWeek`: 0 = Sunday ... 6 = Saturday. `timeOfDay`: minutes after midnight (540 = 09:00).
A connector that does not exist or belongs to another user is rejected with the same `422`.

Optional `configurations.outputSchema` is a JSON Schema (Draft 2020-12, at most 16,000
characters, local `$ref` only) the agent's final reply must match. The runner validates
the reply: a match is stored as `result.parsed`; a mismatch fails the run with
`output_invalid_json` or `output_schema_mismatch` and keeps `result.output`. Chains hand
`result.parsed` to the next step as compact JSON (`spec/2026-10-11-structured-agent-output/`).

`PATCH /api/v1/agents/{user_sso}/{agent_id}` accepts any of `agentTitle`, `systemPrompt`,
and `configurations` (at least one required). When `configurations` is sent it fully
replaces the stored object; the same connector-reference rules apply as on create.

Adding a connector type: subclass `BaseContract` in `app/domains/primitives/` and add a
`ConnectorType` to `registry.CONNECTORS`. Rules and rationale: `spec/2026-10-10-connectors/`.

## Run an agent (local Docker)

Enqueue a run (returns `202` immediately). Optional JSON body `{ "input": "..." }`
(max 20,000 characters) becomes the runner user message; omit it to keep the default.

```bash
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" \
  "http://localhost:8000/api/v1/agents/sso-user-a/<agent-id>/executions"

curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/agents/sso-user-a/<agent-id>/executions" \
  -d '{"input": "Summarize yesterday"}'
```

Inspect it:

```bash
curl -s -H "X-Dev-User-SSO: sso-user-a" \
  "http://localhost:8000/api/v1/agents/sso-user-a/executions/<execution-id>"
```

History: `GET /api/v1/agents/sso-user-a/executions`.

The API only inserts a `queued` row. A worker claims it, starts the Strands runner
container, and the container POSTs `/api/v1/internal/executions/{id}/complete` with
`X-Execution-Callback-Token`. That token is stored hashed; it is not a user SSO header.

Put a platform-owned `OPENAI_API_KEY` in `api/.env` (never commit it). The worker injects
it into the container. Without a key, the execution fails with `llm_unconfigured` and no
container is started. The key must not appear in agent configuration or callback results.

### Local loop

1. Postgres: `docker compose up -d`
2. Build the runner image from the repo root: `docker build -t agent-platform-runner:local runner`
3. API (from `api/`): `uv run uvicorn app.main:app --app-dir src --reload --host 0.0.0.0 --port 8000`
4. Worker (from `api/`): `uv run agent-worker`
5. Scheduler (optional, from `api/`): `uv run agent-scheduler`

The scheduler is a separate process. It reads each agent's `configurations.dayOfWeek`
and `timeOfDay`, and each chain's `schedule` with the same fields, in
`SCHEDULER_TIMEZONE` (default UTC; `0` = Sunday). It enqueues at most once per
agent or chain per slot (`YYYY-MM-DD:mmmm`). Empty `timeOfDay` means not scheduled.
Poll interval is `SCHEDULER_POLL_INTERVAL_SECONDS` (default 15).

## Webhook triggers

Create a signed inbound URL that enqueues a run. Auth on create/list/delete is the
usual `X-Dev-User-SSO`. The fire route uses HMAC only — no SSO, no user id in the path.

```bash
# Returns the plaintext secret once. List/get mask it as "********".
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/webhooks/sso-user-a" \
  -d '{"target_type":"agent","target_agent_id":"<agent-id>"}'
# Chain: {"target_type":"chain","target_chain_id":"<chain-id>"}

# Integrator call. Sign the raw body with HMAC-SHA256.
# Header: X-Webhook-Signature: sha256=<hex>  (bare hex is also accepted)
BODY='{"ticket":"INC-1"}'
SIG=$(python -c "import hmac,hashlib,sys; print(hmac.new(sys.argv[1].encode(), sys.argv[2].encode(), hashlib.sha256).hexdigest())" "$SECRET" "$BODY")
curl -s -X POST "http://localhost:8000/api/v1/hooks/<webhook-id>" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=$SIG" \
  -d "$BODY"
```

A valid fire returns `202`. Agent webhooks return a queued execution; chain webhooks
return a running chain run (`trigger=webhook`). The body is stored as per-run
`input`: compact JSON when the body is JSON, otherwise the UTF-8 text. Invalid
signature is `401` and creates no row. A deleted target (or deleted webhook) is
`404`. Max body is `WEBHOOK_MAX_BODY_BYTES` (default 20,000). Each webhook is
limited to `WEBHOOK_RATE_LIMIT_PER_MINUTE` fires (default 30; in-memory per API
process). Creating a webhook requires `SECRETS_ENCRYPTION_KEY`.

## Agent chains

A chain is an ordered list of the owner's agents. Running a chain enqueues step 0,
then each successful callback hands `result.output` to the next step. A failed step
fails the chain and later steps are never queued.

```bash
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/chains/sso-user-a" \
  -d '{
    "title": "Triage",
    "steps": [
      {"agent_id": "<agent-a>", "label": "summarize"},
      {"agent_id": "<agent-b>"}
    ],
    "schedule": {"dayOfWeek": [1], "timeOfDay": [540]}
  }'
```

Array order is run order (`position` 0, 1, …). Every `agent_id` must belong to the
caller; missing or foreign IDs return `422` with the same "Agent not found" message.
`MAX_CHAIN_STEPS` (default 10) caps length. `schedule` uses the same `dayOfWeek` /
`timeOfDay` / `month` shape as agents and is fired by `agent-scheduler`.

List: `GET /api/v1/chains/{sso}`. Get: `GET /api/v1/chains/{sso}/{chain-id}`.
Delete: `DELETE /api/v1/chains/{sso}/{chain-id}`.

Start a run (optional `{ "input" }` becomes step 0's user message):

```bash
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/chains/sso-user-a/<chain-id>/runs" \
  -d '{"input": "ticket INC-1"}'
```

Poll `GET /api/v1/chains/{sso}/runs/{run-id}` for `status` and `final_result` only.
The process log is `GET /api/v1/chains/{sso}/runs/{run-id}/steps` (order `[0,1,…]`).
Handoff text is `Previous step output:\\n` plus the prior `result.output`, then
optional `Previous step tool results:\\n` with bounded `tool_calls[].response_body`
(for HTTP/MCP/DB payloads). The combined text is truncated to
`MAX_CHAIN_HANDOFF_BYTES` (default 20,000). The worker passes that input to the
runner as `RUN_INPUT_B64`. Webhooks may target a chain with `target_type: chain`.

The container must reach the API at `EXECUTION_CALLBACK_BASE_URL`
(default `http://host.docker.internal:8000`). The worker always passes
`--add-host=host.docker.internal:host-gateway` for Linux Docker.

The runner uses AWS Strands Agents with OpenAI (`system_prompt` from the agent record).
HTTP connectors become Strands tools that call the **stored** method/URL only (the model
cannot pick a URL). Optional `queryParams` / `bodyParams` allowlists let the model fill
query string or POST JSON keys. Preview MCP tools with
`GET /api/v1/connectors/{sso}/{id}/tools`. MCP connectors are listed at claim time
(fail closed if an `allowedTools` name is missing on the server) and become Strands
tools over streamable HTTP.
See `spec/2026-10-10-strands-openai-runner/`, `spec/2026-10-10-agent-execution-http-tools/`,
and `spec/2026-10-21-agent-execution-mcp/`.

Owners may have at most `MAX_ACTIVE_EXECUTIONS_PER_OWNER` queued or running jobs (default 5).

### TLS interception (corporate networks / Zscaler / Netskope)

On hosts where Docker containers cannot reach external HTTPS endpoints due to a corporate
TLS proxy, generate a PEM bundle from the macOS keychain and point the worker at it:

```bash
security find-certificate -a -p \
  /System/Library/Keychains/SystemRootCertificates.keychain \
  /Library/Keychains/System.keychain > ~/mac-ca.pem
```

Add to `api/.env`:

```
EXECUTION_SSL_CA_BUNDLE=/Users/yourname/mac-ca.pem
```

The worker mounts the file read-only into every execution container at
`/tmp/ca-bundle.pem` and sets `SSL_CERT_FILE` so Python/httpx uses it.
Leave `EXECUTION_SSL_CA_BUNDLE` unset on standard production hosts where
public CA chains are sufficient. See `spec/2026-10-10-ssl-ca-bundle/` for
full rationale and the production setup guide.

## Agent flow (copy-paste)

1. Create an HTTP connector (optional credentials encrypted at rest).
2. Create an agent whose `configurations.primitives` maps that connector id to `{}`.
3. Enqueue: `POST /api/v1/agents/{sso}/{agentId}/executions` → `202` + execution id.
4. Poll: `GET /api/v1/agents/{sso}/executions/{executionId}` until `succeeded` or `failed`.
5. `data.result.output` is the model text; `data.result.tool_calls` lists HTTP tools used.

## Database connectors

`type: "database"` follows the same generic contract. `config.mode` picks how the
database is reached.

**External** (a database you run; TLS is required, access is `readOnly` by default):

```json
{
  "type": "database",
  "contractVersion": 1,
  "name": "orders_db",
  "description": "Orders read replica. Tables: orders, customers.",
  "credentials": { "username": "agent_reader", "password": "<password>" },
  "config": {
    "mode": "external",
    "engine": "postgres",
    "host": "db.example.com",
    "port": 5432,
    "database": "orders",
    "tls": "verifyFull",
    "access": "readOnly"
  }
}
```

**Provisioned** (the platform starts the database when the agent's run starts):

```json
{
  "type": "database",
  "contractVersion": 1,
  "name": "scratch",
  "description": "The agent's own database for notes and results.",
  "config": {
    "mode": "provisioned",
    "engine": "postgres",
    "version": "16",
    "database": "agent",
    "lifecycle": "agent",
    "memoryMb": 512
  }
}
```

| engine | external default port | provisioned versions (default) |
| --- | --- | --- |
| `postgres` | 5432 | 15, 16, 17 (16) |
| `mysql` | 3306 | 8.0, 8.4 (8.4); `memoryMb` at least 512 |
| `mongodb` | 27017 | 7.0, 8.0 (8.0); `memoryMb` at least 512 |
| `redis` | 6379 | 7; no `database` or `username` |

- `lifecycle: "agent"` keeps the database and its data between runs; `"run"` starts an
  empty one for every run and deletes it when the run ends.
- Provisioned `credentials` are optional. Without them the platform generates the
  password (derived from `SECRETS_ENCRYPTION_KEY` for `agent` databases, random for
  `run` databases).
- External hosts must be public, like HTTP and MCP URLs. For a database on your own
  machine, use a provisioned one instead. Linode/Akamai managed databases work as
  external databases (paste the CA certificate into `caCertificate`).
- Give external databases a read-only database user when the agent only reads.

Agents reference database connectors like HTTP ones: `"primitives": { "<id>": {} }`.

When the worker claims a run it calls `agent_databases()` before `docker run`. Provisioned
databases start (or reuse) for that run; `lifecycle: "run"` databases are removed afterwards,
including when the container fails. Connection details are passed as `DATABASE_TOOLS_JSON`
(no passwords) and `DATABASE_CREDENTIALS_JSON` (passwords and optional CA). Loopback hosts
are rewritten to `host.docker.internal` so the runner container can reach databases published
on the Docker host. Set `DATABASE_PROVISIONER_NETWORK` when the runner and databases share a
Docker network instead of published ports.

Read-only connectors are enforced in the runner (`SELECT` / read commands only), not by the
model.

### Try provisioning without a run

The same hook the worker uses can be exercised from the CLI (Docker must be running):

```bash
uv run python -m app.runtime.databases_cli up <agent id>                    # Ctrl+C ends the "run"
uv run python -m app.runtime.databases_cli up <agent id> --show-passwords   # print passwords in URLs
uv run python -m app.runtime.databases_cli stop <agent id>                  # stop, keep data
uv run python -m app.runtime.databases_cli remove <agent id>                # delete with data
```

The first start of an engine pulls its image, which can take a minute.

Containers are named `cdb-<agent>-<connector>`, labelled `constitution.*`, limited to
`memoryMb`, 1 CPU and 256 processes, run with `no-new-privileges`, and published on
127.0.0.1 only. List them with `docker ps --filter label=constitution.managed=database`.

Tests against real images (opt-in, pulls images):

```bash
RUN_DOCKER_TESTS=1 uv run pytest tests/docker -v           # PowerShell: $env:RUN_DOCKER_TESTS=1; uv run pytest tests/docker -v
```
