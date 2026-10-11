# Task: Curated integration catalog and agent templates

## Problem

Users can bring any HTTP or MCP endpoint, but each one needs a URL, auth header shape, tool names and a prompt that uses them well. Popular agent integrations (web search, scraping, structured extraction) should be one click plus an API key.

## Goals

1. A static, version-controlled catalog of platform-maintained integrations:
   - **Exa** web search (hosted MCP, `web_search_exa`, `web_fetch_exa`; API key optional).
   - **Agenty** scraping (hosted MCP, `markdown`, `links`, `extract`; Bearer key required).
   - **AgentQL** structured extraction (REST `POST /v1/query-data` through the HTTP connector with `bodyParams` `url`, `prompt`, `query`; `X-API-Key` required). AgentQL's MCP server is stdio-only, which the platform rejects.
2. `GET /api/v1/integrations` lists entries (no secrets). `POST /api/v1/integrations/{sso}/{integration_id}/install` creates an ordinary connector for the caller from the entry, formatting the API key into the right credential header.
3. Agent templates (`GET /api/v1/agent-templates`): Research assistant (Exa), Web data extractor (AgentQL), Page watcher (Agenty + memory). A template carries a title, system prompt, integration ids, and suggested allowed tools.
4. Frontend: catalog section on the connectors page with install sheet; "Start from template" on the new-agent form that fills the prompt and attaches installed integrations.

## Acceptance criteria

1. Every catalog contract validates through `parse_contract` (unit test).
2. Install with a required key missing returns 422 `api_key_required`; install of an unknown id returns 404.
3. Installed connectors are ordinary, owner-scoped connectors; credentials are encrypted and masked like any other.
4. Install with a taken name returns 409 `connector_name_taken`; the caller may pass `name`.
5. Templates reference only catalog ids that exist, and their allowed tools are within the integration's tools (unit test).
6. AgentQL connectors cannot let the model set `params`, `html` or proxy settings (only `url`, `prompt`, `query`).

## Out of scope

Per-tenant catalog admin, OAuth flows, usage billing, auto-updating entries from mcpservers.org.
