# Plan: Connectors table, generic primitive contract, and MCP connectors

## Data model

```text
connectors                              connector_secrets
  id              uuid pk                 id            uuid pk
  owner_user_sso  varchar(255)            connector_id  uuid fk → connectors.id (cascade)
  type            varchar(32)             field_name    varchar(64)   e.g. "xApiKey"
  name            varchar(64)             ciphertext    text          Fernet
  contract        jsonb  (masked)         created_at
  created_at, updated_at                  unique (connector_id, field_name)
  unique (owner_user_sso, name)

agents.configurations
  { primitives: { "<connectorId>": { allowedTools?: [...] } },
    month, dayOfWeek, timeOfDay }
```

`connectors.contract` holds the full generic contract with every credential value replaced by `"********"`, so a GET can return it directly. `type` and `name` are also columns for uniqueness and filtering.

Migration `003_connectors`: drop `agent_secrets` (introduced by the unmerged previous change, never holding production data), create `connectors` and `connector_secrets`. Downgrade restores `agent_secrets`.

## Modules

```text
app/domains/primitives/           connector contracts (no persistence)
  network.py   SSRF guard
  base.py      BaseContract, ConnectorOptions, HeaderCredentials, Credential
  http_contract.py, mcp_contract.py
  registry.py  CONNECTORS + ConnectorContract discriminated union + catalog
  router.py    GET /api/v1/connector-types

app/domains/connectors/           user-owned connectors (persistence + API)
  models.py repository.py service.py controller.py router.py schemas.py

app/domains/agents/               agents reference connectors
  configurations.py  ConnectorReference, AgentConfigurations (references only)
  service.py         create_agent validates references through ConnectorLookup
```

Appended to team files (no existing lines changed): `core/auth.py` (`ensure_caller_owns`), `api/deps.py` (connector dependencies), `api/v1/router.py` (two routers), `tests/integration/conftest.py` (connector cleanup fixture).

## Decisions

- **Generic secret rule:** everything inside `credentials` is a secret. This replaces per-field markers: storage, masking and the catalog's `credential_fields` all read the credentials model.
- **`type` is required** for all contracts; inline contracts with an implicit HTTP type no longer exist.
- **Validation in services**, raising `AppError` with sanitized paths (`describe_validation_errors`), because the existing request-validation handler returns `500` for custom validator errors and echoes input.
- **`primitives` keyed by connector ID** keeps the team's object shape, rules out duplicate references, and lets each agent narrow MCP tools independently.
- **Ownership check** lives in `core/auth.ensure_caller_owns` for the new connectors service. The agents service keeps its existing private method (team code is not modified), so the rule exists in two places until that is refactored.
- **Catalog path** is `/api/v1/connector-types`; `/api/v1/connectors/types` would collide with `/api/v1/connectors/{user_sso}`.
- **Response casing** follows existing responses (snake_case: `owner_user_sso`, `credential_fields`); contract bodies stay camelCase per the team spec.

## Validation strategy

TDD. Unit: contract rules for both types, registry/catalog, agent configuration shape, connector service (masking, encryption, 503, ownership, 422 paths) and agent service (reference resolution) with fakes. Integration (PostgreSQL): connectors API (201, 409, 403/401, listing isolation, encrypted rows), agent creation with references (own connector OK, other user's connector 422, MCP allowlist rules), catalog. Migration round-trip and `alembic check`.
