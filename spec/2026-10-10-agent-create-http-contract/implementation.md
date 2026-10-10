# Implementation record: Agent creation, typed configurations, and the HTTP contract

## Status

Implemented 2026-10-10 on branch `feat/agent-create-http-contract`. Awaiting human review (touches secret handling and a public API contract, per AGENTS.md).

## What was implemented

- `POST /api/v1/agents/{user_sso}` → `201` `ApiEnvelope[AgentRead]`.
- `HttpContract` (`app/domains/primitives/http_contract.py`): team-spec field names, GET/POST, `contractVersion` 1, retries 0–5, timeout 100–60,000 ms, GET without payload, SSRF guard on the URL host, unknown fields rejected.
- `AgentConfigurations` (`app/domains/agents/configurations.py`): `primitives` (≤ 20, identifier-style names) of HTTP contracts, `month`, `dayOfWeek`, `timeOfDay`.
- Credential separation: `split_secrets()` masks `xApiKey` / `authorizationHeader` with `"********"`; values are Fernet-encrypted (`app/core/secrets.py`) into the new `agent_secrets` table in the same transaction as the agent.
- `SECRETS_ENCRYPTION_KEY` setting (`SecretStr`); `get_secret_cipher` dependency.
- Migration `002_create_agent_secrets`.
- `api/README.md` and `api/.env.example` sections.

## Additive-only constraint

No existing line was edited or deleted. Verified with `git diff --numstat` (0 deletions across all modified tracked files). Existing modules gained appended code and new import lines only.

## Decisions

See `plan.md`. Notable: configuration validation runs in the service (see the defect below); schedule conventions `dayOfWeek` 0 = Sunday and `timeOfDay` in minutes after midnight; `agentTile` accepted as a typo alias; existing `schedule_*` columns left null for new agents.

## Test results

```text
uv run pytest -q
74 passed   (6 pre-existing, unchanged + 68 new: 58 unit, 10 integration against PostgreSQL)
```

Migrations on a fresh database: `upgrade head` → `downgrade 001_create_agents` → `upgrade head` all succeeded; `alembic check` reported no differences between models and migrations.

Live smoke test (`uvicorn`, `APP_ENV=development`): POST with a credential returned `201` with `"********"`; GET did not contain the credential; the row in `agent_secrets` held Fernet ciphertext; the plaintext did not appear in the server log even with SQLAlchemy echo enabled; a cloud-metadata URL returned `422` naming `configurations.primitives.m.URL`.

## Pre-existing defects found (not fixed: outside the additive-only scope)

1. **Validation handler returns 500 for custom validators.** `register_exception_handlers` passes `exc.errors()` into the envelope. When a Pydantic validator raises `ValueError`, its `ctx` contains the exception object, which cannot be serialized, so the response is `500` instead of `422`. Reproduced with a minimal model. Fix: in `validation_exception_handler`, use `fastapi.encoders.jsonable_encoder(exc.errors())`, or drop `ctx`/`input` from each error. Dropping `input` also stops request bodies (which may include credentials) being echoed in error responses.
2. **Unused import:** `total_pages` in `domains/agents/service.py`.
3. **No repository-level `.gitignore`:** `api/__pycache__/main.cpython-314.pyc` and `.DS_Store` are committed, and nothing prevents committing `api/.env`.

## Known limitations

- Contracts are validated, not executed. The executor (timeouts, bounded retries with backoff, resolved-IP SSRF re-check, response size cap) belongs with the task-queue feature.
- No update/delete endpoints yet; therefore no key rotation or re-encryption path.
- The schedule lives in `configurations`; the older `schedule_month/day/time` columns are now redundant. Decide whether to drop or back-fill them.
- Response field casing is mixed: request bodies and `configurations` use camelCase (team spec), while `AgentRead` and the envelope use snake_case (existing code).

## Follow-up

- Fix the validation handler (defect 1) in its own change.
- Executor + worker: decrypt `agent_secrets` only inside the worker at call time.
- PATCH/DELETE for agents, including credential replacement.
