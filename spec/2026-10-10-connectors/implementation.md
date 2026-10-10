# Implementation record: Connectors table, generic primitive contract, and MCP connectors

## Status

Implemented 2026-10-10 as the second commit on top of [agent creation](../2026-10-10-agent-create-http-contract/implementation.md). It replaces an earlier, unmerged draft that embedded connector contracts inside agents. Awaiting human review (secret handling, tenant isolation, public API contracts, migration).

## What was implemented

- **Generic contract** (`app/domains/primitives/base.py`): `type`, `contractVersion`, `name`, `description`, `options` (`retries` ≤ 5, `timeout` 100–60,000 ms), `credentials`, `config`. Everything in `credentials` is a secret.
- **HTTP** (`http_contract.py`): `credentials {xApiKey, authorizationHeader}`, `config {method GET|POST, URL, payload}`; SSRF guard; no payload on GET.
- **MCP** (`mcp_contract.py`): same credentials, `config {URL, transport: "streamableHttp"}`; `stdio` refused.
- **Registry** (`registry.py`): `CONNECTORS`, `parse_contract`, `split_credentials`, `connector_catalog`.
- **Connectors domain** (`app/domains/connectors/`): `connectors` and `connector_secrets` tables, repository, service, controller, router. `POST` and `GET /api/v1/connectors/{user_sso}`.
- **Catalog:** `GET /api/v1/connector-types`.
- **Agents** now store only references: `configurations.primitives = { "<connectorId>": { allowedTools? } }` plus `month`, `dayOfWeek`, `timeOfDay`. `create_agent` resolves references against the caller's own connectors.
- **Migration** `003_connectors`: drops `agent_secrets`, creates `connectors` and `connector_secrets`.
- `common/validation_errors.py` (shared error formatting), `core/auth.ensure_caller_owns`.
- README and `.env.example` sections updated.

## Original code untouched

Against the team's commit `bf8f88e`, every original file has 0 deleted lines (`git diff bf8f88e --numstat`). Additions to team files: `core/auth.py`, `api/deps.py`, `api/v1/router.py`, `alembic/env.py` (one import so autogenerate sees connector models), `tests/integration/conftest.py` (connector cleanup fixture). `agents/models.py` is back to its original content (the earlier `AgentSecret` model is superseded).

## Decisions

As in `plan.md`, plus:

- **Fixture ordering.** The connector cleanup fixture declares a dependency on `_configure_test_env`. Without it, pytest ran it (and `database_harness`) before the per-test engine reset, so every test after the first reused an engine bound to the previous event loop and was silently skipped.
- **Alembic import.** `alembic check` initially proposed dropping the connector tables because `env.py` imported only agent models; one import line fixes autogenerate.

## Test results

```text
uv run pytest -q -rs
136 passed   (0 skipped)
```

Migrations on a fresh database: `upgrade head` → `downgrade 002` → `downgrade 001` → `upgrade head` succeeded; `alembic check`: no differences.

Live smoke test (`uvicorn`, development): connector types listed; MCP connector created with its token masked and stored as Fernet ciphertext; duplicate name `409`; per-user listing; agent created referencing two connectors; referencing another user's connector returned `422 Connector not found`; token absent from the server log with SQL echo on.

## Known limitations and follow-ups

- No update or delete endpoints for connectors yet. When delete is added, it must refuse (or cascade policy must be decided) while agents reference the connector: references live in JSONB, so there is no foreign key.
- Connectors are validated, not executed. The worker must decrypt `connector_secrets` only at call time, re-check resolved IPs, apply `options`, and filter MCP `tools/list` by each agent's `allowedTools`.
- The ownership rule exists twice (`AgentService._ensure_caller_may_access`, `core/auth.ensure_caller_owns`) until the team's agents service is refactored to use the shared helper.
- Pre-existing, unchanged: the request-validation handler returns `500` for custom validator errors; unused `total_pages` import in `agents/service.py`; integration tests skip instead of failing when PostgreSQL is unavailable.
