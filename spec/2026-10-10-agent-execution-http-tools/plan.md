# Plan: HTTP connector tools at execution time

## Bundle (trusted worker)

After claim, load connectors by IDs from `configurations.primitives` scoped to `owner_user_sso`.

- `HTTP_TOOLS_JSON`: `{ id, name, method, URL, payload?, timeout_ms, retries }`
- `HTTP_CREDENTIALS_JSON`: `{ "<id>": { xApiKey?, authorizationHeader? } }` Docker env only

MCP rows are skipped. HTTP rows with secrets require `SECRETS_ENCRYPTION_KEY`.

## Runner

Register one Strands `@tool` per HTTP connector (`name` from the contract). The tool always calls the bundled URL/method. Optional headers from the credentials map. Truncate response bodies; summarize `tool_calls` on the callback without secrets.

## Limits

`max_active_executions_per_owner` (queued + running) enforced at enqueue.
