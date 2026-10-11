# Plan: Curated integration catalog and agent templates

## Backend

- `app/domains/integrations/catalog.py`: frozen dataclasses `Integration` and `AgentTemplate`, module-level tuples. Each integration stores a connector contract without credentials, a `credential` mapping (`field`: `xApiKey` | `authorizationHeader`, `format`: `"{key}"` | `"Bearer {key}"`, `required`), `tools` (MCP tool names or HTTP body params shown in the UI), `default_allowed_tools` (MCP only), and doc links.
- `service.py`: `install(owner, integration_id, body, caller, cipher)` builds the contract body and delegates to `ConnectorService.create_connector`, so validation, SSRF checks and secret storage are not duplicated.
- `router.py`: `GET /integrations`, `POST /integrations/{sso}/{integration_id}/install`, `GET /agent-templates`.

| Integration | Type | Target | Credential |
| --- | --- | --- | --- |
| `exa` | mcp | `https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa` | `xApiKey`, optional |
| `agenty` | mcp | `https://api.agenty.ai/mcp` | `authorizationHeader: Bearer …`, required |
| `agentql` | http POST | `https://api.agentql.com/v1/query-data`, payload `{"params":{"mode":"fast"}}`, bodyParams `url,prompt,query`, timeout 60 s | `xApiKey`, required |

## Frontend

- Zod schemas `integrationSchema`, `agentTemplateSchema`; queries `useIntegrations`, `useInstallIntegration`, `useAgentTemplates`.
- `IntegrationCatalog` on `/connectors` (cards: vendor, category, tools, Install/Installed). Install opens a `Sheet` with API key (password input) and optional name.
- Installed detection: a connector whose `config.URL` equals the integration URL.
- `TemplatePicker` on `/agents/new`: applying a template sets title, prompt, memory flag, and attaches matching installed connectors with suggested allowed tools; missing integrations show an inline Install button.
- MSW handlers and Vitest coverage.
