# Plan: Agent creation, typed configurations, and the HTTP contract

## Design

Request flow follows the existing layering:

```text
POST /api/v1/agents/{user_sso}
  router.create_agent            (HTTP: body parsing, 201)
  AgentsController.create        (envelope)
  AgentService.create_agent      (ownership, configuration validation, secret extraction)
  SqlAlchemyAgentRepository.create   (one transaction: agent + secrets)
```

### New modules

| Module | Responsibility |
| --- | --- |
| `app/domains/primitives/http_contract.py` | `HttpContract` Pydantic model and its URL safety check |
| `app/domains/agents/configurations.py` | `AgentConfigurations` model; `split_secrets()` that masks credentials and returns them separately |
| `app/core/secrets.py` | `SecretCipher` (Fernet encrypt/decrypt) |

### Appended to existing modules (no existing lines changed)

| File | Addition |
| --- | --- |
| `domains/agents/models.py` | `AgentSecret` ORM model |
| `domains/agents/schemas.py` | `AgentCreate` request body |
| `domains/agents/repository.py` | `create()` on the protocol and the SQLAlchemy repository |
| `domains/agents/service.py` | `AgentService.create_agent()` |
| `domains/agents/controller.py` | `AgentsController.create()` |
| `domains/agents/router.py` | `POST /{user_sso}` route |
| `api/deps.py` | `get_secret_cipher()` dependency |
| `core/config.py` | `secrets_encryption_key: SecretStr \| None` setting |

New migration `alembic/versions/002_create_agent_secrets.py`. New dependency `cryptography` (Fernet authenticated encryption; established, widely audited).

### Decisions and assumptions

- **Validation happens in the service, not the request model.** The existing `RequestValidationError` handler returns `500` when a custom validator raises `ValueError` (its `ctx` holds a non-serializable exception). Validating `configurations` in the service and raising `AppError` with sanitized field paths avoids that path and keeps business rules out of the transport layer. Error details never echo input values, so credentials are not reflected back.
- **Secrets are masked, not removed.** `configurations` keeps `"********"` where a credential was supplied, so clients can see a credential is configured. Sending `"********"` as a new credential is rejected.
- **`agentTile` is a typo** for `agentTitle`. The body accepts `agentTitle` (preferred), `agentTile`, or `title`.
- **Schedule conventions** (unspecified in the team spec): `month` 1–12 or null; `dayOfWeek` 0–6 with 0 = Sunday (JavaScript `Date.getDay()`); `timeOfDay` minutes after midnight, 0–1439. Lists are de-duplicated and sorted. All schedule fields are optional so unscheduled agents are valid.
- **`primitives` values are HTTP contracts.** HTTP is the only primitive defined so far; a discriminator can be added when MCP or database primitives land.
- **HTTP methods limited to GET and POST**, the first primitives on the roadmap.
- **Existing `schedule_*` columns are left untouched (null for new agents).** The schedule now lives in `configurations` as the team spec defines; dropping or back-filling the columns is a follow-up decision.
- **Limits** (named constants): at most 20 primitives per agent, primitive names `^[a-z][a-z0-9_]{0,63}$`, system prompt ≤ 20,000 characters, credentials ≤ 4,096 characters.

## Validation strategy

TDD. Unit tests (no database): HTTP contract rules, configuration rules, secret splitting, cipher round-trip, service ownership and error mapping with a fake repository. Integration tests (PostgreSQL): POST happy path, persistence and visibility in GET, masking in responses and in stored `configurations`, encrypted secret rows, 401/403/422/503 envelopes. Migration upgrade → downgrade → upgrade.
