# Implementation: HTTP connector tools at execution time

## What was implemented

- Worker builds an HTTP tool bundle from owned connectors after claim (`app/worker/bundle.py`).
- Missing or cross-tenant connector ids fail the run with `connector_missing` (no Docker).
- Credentials require `SECRETS_ENCRYPTION_KEY`; otherwise `secret_storage_unavailable`.
- MCP connectors are skipped (no tools registered).
- Docker env: `HTTP_TOOLS_JSON` (no secrets) and `HTTP_CREDENTIALS_JSON` (headers only).
- Runner `http_tools.py` calls the bundled URL only; URL override is rejected.
- Enqueue cap: `MAX_ACTIVE_EXECUTIONS_PER_OWNER` (queued + running), default 5, HTTP 429.

## Tests

Observed: `uv run pytest tests/unit` → **139 passed**. Integration tests still need Compose Postgres.

## Known limitations

- Credential JSON is still a process environment variable (exfiltration risk, same as OpenAI).
- MCP tools are not executed.
- No Docker network egress allowlist.
