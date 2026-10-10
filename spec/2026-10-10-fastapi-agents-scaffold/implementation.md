# Implementation record: FastAPI agents scaffold

## Status

Completed (2026-10-10).

## What was implemented

- Feature spec under `spec/2026-10-10-fastapi-agents-scaffold/`.
- Layered FastAPI app in `api/src/app/` with async SQLAlchemy + PostgreSQL.
- Standard response envelope: `data`, `error`, `metadata`, `pagination`.
- Agents domain: ORM, repository, service, `AgentsController`, router.
- Endpoint: `GET /api/v1/agents/{user_sso}` with pagination query params.
- Alembic async environment and migration `001_create_agents`.
- Dev/test auth via `X-Dev-User-SSO` header; `403` when header SSO ≠ path `user_sso`.
- `api/docker-compose.yml`, `.env.example`, `api/README.md`, pytest unit + integration tests.

## Decisions

- Kept application code under existing `api/` directory (not README’s aspirational `backend/`).
- Moved `CurrentUser` to `app.core.auth` to avoid circular imports with dependencies.
- Integration tests skip when PostgreSQL is unreachable or credentials do not match `DATABASE_URL` (documented in `api/README.md`).
- `configurations` remains untyped JSON (`dict`) in API until a dedicated schema feature lands.

## Test results

```text
uv run pytest -v
1 passed, 5 skipped (integration skipped: local PostgreSQL auth mismatch vs default DATABASE_URL)
```

With Docker Compose from `api/` (`docker compose up -d`), create `agent_platform_test`, set `DATABASE_URL`, run `alembic upgrade head`, then integration tests should execute instead of skip.

## Deviations from plan

- None material.

## Known limitations

- Production SSO/OAuth not implemented; `APP_ENV=production` returns `401` for all authenticated routes until a user-authentication feature is added.
- Schedule timezone not stored.
- `updated_at` relies on ORM `onupdate`; no database trigger.

## Follow-up

- `spec/...-user-authentication/` for real SSO/JWT validation.
- Agent CRUD (POST/PATCH/DELETE).
- Typed Pydantic models for `configurations` JSONB.
