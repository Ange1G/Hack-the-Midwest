# Task: Strands + OpenAI runner (one LLM turn)

## Problem

Queued executions start a stub container that POSTs a fixed sample result. The platform needs a real agent loop: AWS Strands Agents inside the isolated container, using a platform-owned OpenAI key, driven by the stored `system_prompt`.

## Goals

- Replace the stub runner with Strands `Agent` + `OpenAIModel`.
- Inject `OPENAI_API_KEY` (and model id) at `docker run` time from worker settings; never from agent configuration or client requests.
- Persist model output in `agent_executions.result`; persist failures via the existing callback contract.
- Fail the execution in the worker (no container) when the platform key is missing.

## Constraints

See [AGENTS.md](../../AGENTS.md) and [2026-10-10-agent-execution-mvp](../2026-10-10-agent-execution-mvp/task.md).

- Treat `system_prompt` as untrusted input.
- Do not store, log, or return the API key. Do not put it in `AGENT_MANIFEST` or callback `result`.
- No HTTP/MCP tools, no user-supplied LLM keys, no streaming UI.

## Acceptance criteria

1. With `OPENAI_API_KEY` set on the worker, a run reaches `succeeded` and `result.output` is non-empty model text.
2. Callback `result` never contains `sk-` or the configured key.
3. Missing worker key: execution becomes `failed` with `error_code=llm_unconfigured`; no `docker run`.
4. Strands/OpenAI exceptions POST `failed` with `error.code` / `error.message`, then the process exits non-zero.
5. Existing enqueue/callback/tenant tests still pass without calling OpenAI.
6. `.env.example` and runner README document the key injection and the egress/exfiltration limitation.

## Out of scope

Connector credential injection, HTTP/MCP tools, Bedrock, retries, Akamai scheduler, frontend.
