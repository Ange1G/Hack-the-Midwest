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

The container must reach the API at `EXECUTION_CALLBACK_BASE_URL`
(default `http://host.docker.internal:8000`). The worker always passes
`--add-host=host.docker.internal:host-gateway` for Linux Docker.

The runner uses AWS Strands Agents with OpenAI (`system_prompt` from the agent record).
HTTP connectors become Strands tools that call the **stored** method/URL only (the model
cannot pick a URL). MCP connectors are listed at claim time (fail closed if an
`allowedTools` name is missing on the server) and become Strands tools over streamable HTTP.
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
