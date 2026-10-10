# Implementation: Strands + OpenAI runner

## What was implemented

- Runner image uses Strands `Agent` + `OpenAIModel`. One user turn; callback `{ output, model }` or `failed` / `llm_error`.
- Worker injects `OPENAI_API_KEY` and `OPENAI_MODEL` at `docker run`. Missing key → `failed` / `llm_unconfigured` without starting Docker.
- Manifest is still title / system_prompt / connector ids (no secrets).
- `HOME=/tmp` so the read-only root filesystem can still write caches.

## Decisions

- Provider: OpenAI. Default model `gpt-4o-mini`.
- Timeout default raised to 120s.
- `EXECUTION_STUB_IMAGE` still accepted as an alias of `EXECUTION_RUNNER_IMAGE`.
- If `Agent` has no `system_prompt` parameter, the runner prefixes the user message.

## Tests

Observed: `uv run pytest tests/unit` → **132 passed**. Integration tests still need Compose Postgres. No live OpenAI call in CI.

## Known limitations

- No egress allowlist; a malicious `system_prompt` could try to exfiltrate process env.
- Key is a Docker `-e` variable, not a Docker secret.
- HTTP/MCP tools are not wired.
