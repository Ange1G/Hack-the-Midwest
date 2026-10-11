# Implementation: HTTP connector tools at execution time

## What was implemented

- Worker builds an HTTP tool bundle from owned connectors after claim (`app/worker/bundle.py`).
- Missing or cross-tenant connector ids fail the run with `connector_missing` (no Docker).
- Credentials require `SECRETS_ENCRYPTION_KEY`; otherwise `secret_storage_unavailable`.
- MCP connectors are skipped (no tools registered at run time).
- Docker env: `HTTP_TOOLS_JSON` (no secrets) and `HTTP_CREDENTIALS_JSON` (headers only).
- Runner `http_tools.py` calls the bundled URL only; URL override is rejected.
- Enqueue cap: `MAX_ACTIVE_EXECUTIONS_PER_OWNER` (queued + running), default 5, HTTP 429.
- SSL CA bundle support added in follow-on fix (`spec/2026-10-10-ssl-ca-bundle/`).

## Tests

Unit suite: **141 passed** (as of SSL CA bundle phase). Integration tests require Compose Postgres.

## End-to-end verification (local, 2026-10-10)

Verified with no-connector agent (basic system prompt). HTTP tool flow verified at unit level; live HTTP connector E2E not yet run against a real endpoint.

## Known limitations

- Credential JSON is a Docker process environment variable (exfiltration risk from a compromised system prompt). Move to Docker secrets or a vault before production.
- MCP tools are not executed at run time.
- No Docker network egress allowlist; containers can reach arbitrary external hosts.
- SSL certificate verification in containers requires `EXECUTION_SSL_CA_BUNDLE` on hosts with TLS interception. See `spec/2026-10-10-ssl-ca-bundle/`.
