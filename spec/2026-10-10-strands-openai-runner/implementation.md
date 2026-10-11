# Implementation: Strands + OpenAI runner

## What was implemented

- Runner image uses Strands `Agent` + `OpenAIModel`. One user turn; callback `{ output, model }` or `failed` / `llm_error`.
- Worker injects `OPENAI_API_KEY` and `OPENAI_MODEL` at `docker run`. Missing key → `failed` / `llm_unconfigured` without starting Docker.
- Manifest is title / system_prompt / connector ids (no secrets).
- `HOME=/tmp` so the read-only root filesystem can still write caches.
- HTTP connector tools wired in subsequent phase (`spec/2026-10-10-agent-execution-http-tools/`).

## Decisions

- Provider: OpenAI. Default model `gpt-4o-mini`.
- Timeout default raised to 120s.
- `EXECUTION_STUB_IMAGE` still accepted as an alias of `EXECUTION_RUNNER_IMAGE`.
- If `Agent` has no `system_prompt` parameter, the runner prefixes the user message.

## Tests

Unit suite: **141 passed** (as of SSL CA bundle phase). Integration tests require Compose Postgres. No live OpenAI call in CI.

## End-to-end verification (local, 2026-10-10)

Verified with the full runner image on Colima (macOS):

- `agent-platform-runner:local` built and launched by worker
- OpenAI API call succeeded through corporate TLS proxy (with `EXECUTION_SSL_CA_BUNDLE`)
- Callback POSTed to `http://host.docker.internal:8000/api/v1/internal/executions/{id}/complete`
- Execution record updated to `status: succeeded`
- `result.output`: model text returned and stored correctly
- `result.model`: `gpt-4o-mini` confirmed
- Wall time: ~5 seconds end-to-end

## Known limitations

- No egress allowlist; a malicious `system_prompt` could try to exfiltrate process env.
- `OPENAI_API_KEY` is a Docker `-e` variable, not a Docker secret. See production checklist.
- On hosts with TLS-intercepting proxies, `EXECUTION_SSL_CA_BUNDLE` must point to a PEM bundle. See `spec/2026-10-10-ssl-ca-bundle/`.
