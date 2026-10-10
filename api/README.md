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

## Agent credentials

HTTP contracts may carry `xApiKey` and `authorizationHeader`. They are encrypted with
`SECRETS_ENCRYPTION_KEY`, stored in the `agent_secrets` table, and replaced by `"********"`
in `configurations`, so API responses never include them.

Generate a key and put it in `.env` (never commit it):

```bash
uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Without a key, agents without credentials still work; creating one with credentials returns `503`.
Losing or changing the key makes stored credentials unreadable.

## Create an agent

```bash
curl -s -X POST -H "X-Dev-User-SSO: sso-user-a" -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/agents/sso-user-a" \
  -d '{
    "agentTitle": "Weekday digest",
    "systemPrompt": "Summarize new issues from the last day.",
    "configurations": {
      "primitives": {
        "list_issues": {
          "contractVersion": 1,
          "method": "GET",
          "URL": "https://api.github.com/repos/acme/web/issues",
          "authorizationHeader": "Bearer <token>",
          "options": { "retries": 3, "timeout": 10000 }
        }
      },
      "dayOfWeek": [1, 2, 3, 4, 5],
      "timeOfDay": [540]
    }
  }'
```

`dayOfWeek`: 0 = Sunday ... 6 = Saturday. `timeOfDay`: minutes after midnight (540 = 09:00).
Full rules: `spec/2026-10-10-agent-create-http-contract/`.
