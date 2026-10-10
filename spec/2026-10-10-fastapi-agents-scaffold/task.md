# Task: FastAPI production scaffold (agents domain)

## Problem

The platform needs a production-oriented API layer to persist and expose user-owned agent configurations. The current API is a minimal hello-world stub with no database, response contract, or domain structure.

## Goals

- Scaffold FastAPI with async SQLAlchemy and PostgreSQL.
- Enforce a consistent JSON response envelope: `data`, `error`, `metadata`, `pagination`.
- Introduce a layered (presentation / application / domain / infrastructure) layout under `api/`.
- Ship the agents domain with `GET /api/v1/agents/{user_sso}` returning a paginated list of agents for that owner.
- Manage schema via Alembic migrations.

## Constraints

See [AGENTS.md](../../AGENTS.md): tenant isolation, backend authorization, thin handlers, PostgreSQL migrations, no secrets in repo.

## Acceptance criteria

1. Feature spec directory exists with `task.md`, `plan.md`, and `implementation.md`.
2. `GET /api/v1/agents/{user_sso}?page=&page_size=` returns `ApiEnvelope` with agent list and pagination.
3. `agents` table includes: `id`, `title`, `system_prompt`, `configurations` (JSONB), schedule fields, `owner_user_sso`, timestamps.
4. Alembic initial migration creates `agents` table; `alembic upgrade head` succeeds.
5. Cross-tenant access returns 403 when caller SSO does not match path `user_sso` (dev auth header documented).
6. pytest unit and integration tests pass against PostgreSQL (or documented test DB).

## Out of scope

Full SSO/OAuth, CRUD beyond list, typed `configurations` schema, task queue, agent execution.
