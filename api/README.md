# Agent Platform API

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
| `http` | `xApiKey`, `authorizationHeader` | `method` (GET/POST), `URL`, `payload` |
| `mcp` | `xApiKey`, `authorizationHeader` | `URL`, `transport` (`streamableHttp`) |

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

Adding a connector type: subclass `BaseContract` in `app/domains/primitives/` and add a
`ConnectorType` to `registry.CONNECTORS`. Rules and rationale: `spec/2026-10-10-connectors/`.

## Run an agent (local Docker)

Enqueue a run (returns `202` immediately):

```bash
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" \
  "http://localhost:8000/api/v1/agents/sso-user-a/<agent-id>/executions"
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

The container must reach the API at `EXECUTION_CALLBACK_BASE_URL`
(default `http://host.docker.internal:8000`). The worker always passes
`--add-host=host.docker.internal:host-gateway` for Linux Docker.

The runner uses AWS Strands Agents with OpenAI (`system_prompt` from the agent record).
HTTP connectors become Strands tools that call the **stored** method/URL only (the model
cannot pick a URL). MCP connectors are ignored at run time for now.
See `spec/2026-10-10-strands-openai-runner/` and `spec/2026-10-10-agent-execution-http-tools/`.

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
