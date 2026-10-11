# Agent runner (Strands + OpenAI)

Isolated execution image. The worker injects a **platform-owned** `OPENAI_API_KEY` at
`docker run` time. The key must not appear in agent configuration, logs, or callback
results.

```bash
docker build -t agent-platform-runner:local .
```

## Environment (set by the worker)

| Variable | Purpose |
| --- | --- |
| `CALLBACK_URL` | `POST …/internal/executions/{id}/complete` |
| `CALLBACK_TOKEN` | Hashed at rest by the API |
| `AGENT_MANIFEST` | JSON: `title`, `system_prompt`, `connector_ids` (no secrets) |
| `RUN_INPUT_B64` | Optional per-run user message, UTF-8 base64. Preferred so multiline chain handoff survives `docker run -e`. |
| `RUN_INPUT` | Legacy plaintext fallback. Used only when `RUN_INPUT_B64` is unset. |
| `OPENAI_API_KEY` | Platform key; never from the client |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `HTTP_TOOLS_JSON` | HTTP connector specs (method, URL, payload). No credentials. |
| `HTTP_CREDENTIALS_JSON` | Map of connector id → header credentials. Never in the manifest. |
| `DATABASE_TOOLS_JSON` | Database connector specs (engine, host, port, read_only). No passwords. |
| `DATABASE_CREDENTIALS_JSON` | Map of connector id → `{ password, caCertificate? }`. Never in the manifest. |
| `MCP_SERVERS_JSON` | MCP servers and allowlisted tool names. No credentials. |
| `MCP_CREDENTIALS_JSON` | Map of connector id → header credentials. Never in the manifest. |

The container must reach the API at `EXECUTION_CALLBACK_BASE_URL`
(default `http://host.docker.internal:8000`). The worker passes
`--add-host=host.docker.internal:host-gateway`.

## Security

The agent container is untrusted (`system_prompt` is user-controlled). A malicious
prompt could try to read process environment and send it outbound. Local MVP has no
egress allowlist; production must restrict network to OpenAI and the callback host,
and should prefer short-lived credentials over a long-lived `-e` key.
