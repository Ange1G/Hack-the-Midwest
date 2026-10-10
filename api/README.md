# Agent Platform API

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
