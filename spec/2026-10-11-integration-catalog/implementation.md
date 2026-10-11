# Implementation: Curated integration catalog and agent templates

Status: implemented; awaiting human review.

## What shipped

### API

- `app/domains/integrations/catalog.py`: static catalog of three integrations and three templates.
  - `exa`: MCP, `https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa`. The key is optional and goes in `xApiKey`.
  - `agenty`: MCP, `https://api.agenty.ai/mcp`. The key is required and sent as `Authorization: Bearer <key>`.
  - `agentql`: HTTP `POST https://api.agentql.com/v1/query-data`. Its MCP server is stdio-only, which the platform rejects, so it uses the REST API instead. The model may set only `url`, `prompt` and `query`; `params` (proxies, raw HTML) stay fixed.
  - Templates: `research_assistant` (Exa), `web_data_extractor` (AgentQL), `page_watcher` (Agenty `markdown` only, with memory on).
- `GET /api/v1/integrations` and `GET /api/v1/agent-templates` are public to any signed-in user; they contain no user data.
- `POST /api/v1/integrations/{user_sso}/{integration_id}/install`, body `{apiKey?, name?}`:
  - deep-copies the contract and formats the key into the credential field;
  - passes the result to the normal `ConnectorService.create_connector`, so ownership, name rules, SSRF checks and encryption are unchanged;
  - returns 404 for an unknown id and 422 `api_key_required` when a required key is missing.

### Frontend

- An `IntegrationCatalog` section on `/connectors`. Each card shows the vendor, type, tool count, whether a key is required, and a docs link.
- Install opens a Sheet with a password field and an optional connector name.
- An integration counts as "Installed" when a connector has the same type and endpoint URL; the card then links to that connector.
- If the default name is already taken, the client retries once with a random suffix (same pattern as `createConnectorRecord`).
- `TemplatePicker` on `/agents/new` fills in the title, instructions and memory flag. It attaches the newest install of each integration the template uses, with the template's MCP allowlist. Integrations that are not installed are listed with a link to install them.

## Decisions

- **Static catalog.** The catalog lives in code, not in the database. It is versioned with the code and needs no admin UI.
- **Installs are ordinary connectors.** There is no "integration" table and no special case in the worker or runner.
- **Install detection by URL.** The frontend matches installs by connector type and endpoint URL rather than storing a link to the catalog entry. Editing a connector's URL therefore makes it stop counting as installed. This is acceptable for now.

## Tests

- API: `tests/unit/test_integration_catalog.py` and `tests/integration/test_integrations_api.py`. They cover the key formats, the required-key 422, the unknown-id 404, owner scoping, and that the key never appears in responses.
- FE: `integration-catalog.test.tsx` (required-key validation; the install request body; the key not stored in the client-visible contract) and `template-picker.test.ts` (newest install wins, allowlist applied, missing integrations reported).

## Known limitations

- Install calls are not checked against the live vendor APIs, and API keys are not verified at install time.
