# Agent Platform

A multi-tenant platform for building, configuring, and running user-defined AI agents in isolated execution environments.

The platform provides agent orchestration, reusable tools, integrations, distributed execution, and security monitoring. Users define their own agent use cases and supply the configuration and credentials required to connect their agents to external services.

## Overview

### Core capabilities

- **Agent management:** Create, configure, execute, and monitor custom agents.
- **Agent orchestration:** Use AWS Strands Agents to orchestrate agent behavior and tool interactions.
- **Isolated execution:** Run user agents in Docker containers hosted on Akamai Cloud infrastructure.
- **Tool primitives:** Reusable HTTP connectors; MCP connector definitions stored and referenced at run time.
- **Bring-your-own integrations:** Connect user-provided HTTP endpoints and MCP servers using user-supplied configuration and credentials, encrypted at rest.
- **Distributed execution:** Execute long-running jobs asynchronously; a worker polls the task queue and launches Docker containers independently of the API.
- **Execution observability:** Track execution status (`queued`, `running`, `succeeded`, `failed`, `timed_out`), results, errors, and metadata.

## Architecture

### High-level system

```text
                        Web Application (planned)
                     React / TanStack / shadcn
                               |
                               v
                         FastAPI API  ←── internal callback ──┐
                               |                              │
                +--------------+--------------+               │
                |              |              |               │
                v              v              v               │
          PostgreSQL      Agent Service    Task Queue         │
           (task queue,        |         (SELECT FOR          │
           executions,         |          UPDATE SKIP         │
           connectors,         |          LOCKED)             │
           agents)             v               |               │
                        AWS Strands       agent-worker        │
                          Agents              |               │
                                             v               │
                                    Isolated Docker ─────────┘
                                     Containers
                                         |
                         +---------------+---------------+
                         |                               |
                         v                               v
                     HTTP Tools                    MCP Servers
                  (fixed URL/method)             (user-provided,
                  credentials injected            currently stored
                  per execution                  not executed)
```

### Technology stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, TanStack, shadcn/ui (planned) |
| API | Python 3.14+, FastAPI, Pydantic, SQLAlchemy, Alembic |
| Agent framework | AWS Strands Agents |
| LLM provider | OpenAI (platform-owned key; `gpt-4o-mini` default) |
| Database | PostgreSQL |
| Execution isolation | Docker containers (local); Akamai Cloud (production) |
| Secrets | Fernet symmetric encryption for connector credentials |
| Testing | Vitest, Playwright (frontend); pytest (backend) |

The production message broker, container scheduling strategy, and authentication provider are implementation decisions to be finalized and documented in their respective specifications before scaling.

## Repository structure

```text
.
├── AGENTS.md                  # Constitution: requirements, SDLC, quality
├── README.md                  # This file
├── api/                       # FastAPI backend
│   ├── src/app/
│   │   ├── domains/           # agents/, connectors/, executions/, primitives/
│   │   ├── worker/            # loop.py, docker_runner.py, bundle.py, runner.py
│   │   └── core/              # config, database, secrets, auth, exceptions
│   ├── alembic/versions/      # Migrations 001–004
│   ├── tests/unit/
│   ├── tests/integration/
│   ├── .env.example
│   └── docker-compose.yml
├── runner/                    # Docker image for isolated agent execution
│   ├── Dockerfile
│   ├── entrypoint.py
│   ├── agent_run.py
│   └── http_tools.py
└── spec/                      # Feature specifications (task, plan, implementation)
    ├── 2026-10-10-fastapi-agents-scaffold/
    ├── 2026-10-10-connectors/
    ├── 2026-10-10-agent-create-http-contract/
    ├── 2026-10-10-agent-execution-mvp/
    ├── 2026-10-10-strands-openai-runner/
    ├── 2026-10-10-agent-execution-http-tools/
    └── 2026-10-10-ssl-ca-bundle/
```

## API overview

All user-facing routes are under `/api/v1`. Dev/test auth: `X-Dev-User-SSO: <sso>` header (path `{user_sso}` must match).

| Action | Method + Path | Status | Notes |
|--------|--------------|--------|-------|
| List connector types | `GET /api/v1/connector-types` | 200 | Schema discovery; no `{user_sso}` |
| Create connector | `POST /api/v1/connectors/{user_sso}` | 201 | Credentials encrypted at rest |
| List connectors | `GET /api/v1/connectors/{user_sso}` | 200 | Paginated |
| Create agent | `POST /api/v1/agents/{user_sso}` | 201 | References connector UUIDs |
| List agents | `GET /api/v1/agents/{user_sso}` | 200 | Paginated |
| Get agent | `GET /api/v1/agents/{user_sso}/{agent_id}` | 200 | |
| Enqueue execution | `POST /api/v1/agents/{user_sso}/{agent_id}/executions` | 202 | Returns immediately; worker runs async |
| Get execution | `GET /api/v1/agents/{user_sso}/executions/{execution_id}` | 200 | Poll until terminal status |
| List executions | `GET /api/v1/agents/{user_sso}/executions` | 200 | Paginated |
| Internal callback | `POST /api/v1/internal/executions/{execution_id}/complete` | 200 | Container → API; token-authenticated |

Execution status lifecycle: `queued` → `running` → `succeeded` | `failed` | `timed_out`.

### User action flow

```text
1. POST /connectors/{sso}          → connector id
2. POST /agents/{sso}              → agent id  (references connector ids)
3. POST /agents/{sso}/{id}/executions → execution id (status: queued)
4. GET  /agents/{sso}/executions/{id} → poll until succeeded/failed
```

## Getting started (local development)

### Prerequisites

- Python 3.14+, [uv](https://docs.astral.sh/uv/)
- Docker (for PostgreSQL and runner containers)
- An OpenAI API key

### 1. Clone and configure

```bash
git clone <repo-url>
cd api
cp .env.example .env
# Edit .env: set OPENAI_API_KEY and SECRETS_ENCRYPTION_KEY
```

Generate a Fernet key for connector credential encryption:

```bash
cd api && uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 2. Start PostgreSQL

```bash
cd api && docker compose up -d
```

Postgres is published on host port **5433** to avoid conflicts with a local `5432`.

### 3. Run migrations

```bash
cd api && uv run alembic upgrade head
```

### 4. Build the runner image (from repo root)

```bash
docker build -t agent-platform-runner:local runner
```

### 5. Start the API

```bash
cd api && uv run uvicorn app.main:app --app-dir src --reload --host 0.0.0.0 --port 8000
```

### 6. Start the worker (separate terminal)

```bash
cd api && uv run agent-worker
```

### 7. Run tests

```bash
cd api && uv run pytest tests/unit         # 141 unit tests (no Postgres required)
cd api && uv run pytest                    # full suite (requires Compose Postgres)
```

### TLS interception (corporate networks / Zscaler / Netskope)

If Docker containers on your machine cannot reach external HTTPS endpoints due to a corporate TLS proxy, generate a CA bundle from the host keychain and set `EXECUTION_SSL_CA_BUNDLE` in `api/.env`:

```bash
security find-certificate -a -p \
  /System/Library/Keychains/SystemRootCertificates.keychain \
  /Library/Keychains/System.keychain > ~/mac-ca.pem
```

Then in `api/.env`:

```
EXECUTION_SSL_CA_BUNDLE=/Users/yourname/mac-ca.pem
```

The worker mounts this file read-only into every execution container and sets `SSL_CERT_FILE`. Leave unset on standard production hosts.

## Production considerations

See [spec/2026-10-10-ssl-ca-bundle/implementation.md](spec/2026-10-10-ssl-ca-bundle/implementation.md) for the full production setup guide. Summary:

### Components to deploy

| Component | Description |
|-----------|-------------|
| PostgreSQL | Managed or self-hosted; port 5432 |
| API process | `uvicorn app.main:app --app-dir src` behind nginx/Caddy |
| Worker process | `uv run agent-worker` as long-running process or container |
| Runner image | Built and pushed to a container registry; worker pulls by tag |

### Required environment variables

**API process:**

| Variable | Purpose |
|----------|---------|
| `APP_ENV=production` | Disables dev SSO header auth |
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRETS_ENCRYPTION_KEY` | Fernet key for connector credentials (from secrets manager) |
| `OPENAI_API_KEY` | Platform-owned key; never user-visible (from secrets manager) |

**Worker process (all API vars plus):**

| Variable | Purpose |
|----------|---------|
| `EXECUTION_RUNNER_IMAGE` | `<registry>/<image>:<tag>` |
| `EXECUTION_CALLBACK_BASE_URL` | `https://<api-host>` (internal URL reachable by containers) |
| `EXECUTION_TIMEOUT_SECONDS` | Container kill timeout (default 120) |
| `MAX_ACTIVE_EXECUTIONS_PER_OWNER` | Per-user concurrency cap (default 5) |
| `EXECUTION_SSL_CA_BUNDLE` | Leave unset on standard Akamai hosts |

### Not ready for production

The following must be resolved before exposing the platform to real users:

- **Authentication:** `X-Dev-User-SSO` is a development mechanism. Real SSO must be implemented.
- **Credential injection:** OpenAI key and connector credentials are Docker environment variables, which are exfiltration-vulnerable from a compromised system prompt. Move to Docker secrets or a vault before production.
- **Egress allowlist:** Execution containers can reach arbitrary external hosts. A network policy or egress proxy is required.
- **Retries and cancellation:** Not implemented. A failed container leaves the execution in a terminal state with no retry.
- **MCP tools in runner:** MCP connector references are stored but not executed at run time.
- **Production container isolation strategy:** Must be validated against the threat model per AGENTS.md before exposing untrusted users to agent execution.

## Agent execution model

### Platform responsibilities

- Provide agent creation, configuration, and lifecycle management.
- Orchestrate agent execution through AWS Strands Agents.
- Execute user agents in isolated Docker containers.
- Manage task queue, execution status, timeouts, and failure reporting.
- Enforce authorization, execution limits, and security policies.

### User responsibilities

- Define the agent's purpose, system prompt, and configuration.
- Supply HTTP connector URLs and any required credentials.
- Configure MCP server connection details (stored; execution support coming).

### Security boundaries

- Container runs as `nobody`, read-only filesystem, `--cap-drop ALL`, `--no-new-privileges`.
- CPU and memory limits enforced per container.
- Callback token is SHA-256 hashed at rest; one-time use per execution.
- Connector credentials are Fernet-encrypted in `connector_secrets`; decrypted only at run time.
- Tenant isolation enforced on every user-facing route: `{user_sso}` in path must match the authenticated caller.

## Project status

The backend MVP is complete and end-to-end verified:

- [x] API scaffold and domain model (agents, connectors, executions)
- [x] HTTP and MCP connector types with encrypted credentials
- [x] Agent creation with connector references and permission scoping
- [x] Asynchronous execution queue (PostgreSQL `SELECT FOR UPDATE SKIP LOCKED`)
- [x] Worker with `LocalDockerRunner`: claim → launch container → reconcile
- [x] AWS Strands Agents + OpenAI runner image
- [x] HTTP connector tools injected into execution containers
- [x] Per-owner active execution limit (429)
- [x] Execution status, results, error codes, and history endpoints
- [x] SSL CA bundle support for TLS-intercepting dev environments
- [x] 141 unit tests passing

**Next:** Frontend dashboard, production authentication, MCP tool execution, egress controls, and CI integration tests.

## License

To be determined.
