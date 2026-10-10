# Plan: FastAPI production scaffold (agents domain)

See the approved plan in the repository implementation PR / chat record. Summary:

- **Spec-first:** this directory.
- **Entry:** `api/src/app/main.py` with `/api/v1` prefix.
- **Endpoint:** `GET /api/v1/agents/{user_sso}` — paginated list by `owner_user_sso`.
- **Layers:** Router → `AgentsController` → `AgentService` → `SqlAlchemyAgentRepository` → PostgreSQL (async).
- **Envelope:** `ApiEnvelope` with `data`, `error`, `metadata`, `pagination`.
- **Auth stub:** `X-Dev-User-SSO` in development; 403 on SSO mismatch.
- **Migration:** Alembic `001_create_agents`.

Detailed file map and validation checklist: see attached implementation plan dated 2026-10-10.
