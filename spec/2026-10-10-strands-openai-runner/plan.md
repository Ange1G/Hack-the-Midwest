# Plan: Strands + OpenAI runner

## Security

| Control | Mechanism |
|---------|-----------|
| Platform-owned key | `Settings.openai_api_key` (`SecretStr`); worker injects `-e OPENAI_API_KEY` |
| Not in agent config | Manifest stays title / system_prompt / connector ids |
| Not in results | Callback body is `{ output, model }` or `{ error }` |
| Isolation | Existing `--read-only`, `--cap-drop ALL`, no Docker socket |
| Known gap | Malicious prompt could try to exfiltrate env; production needs egress allowlist |

## Flow

1. Worker claims `queued` row.
2. If OpenAI key unset → `failed` / `llm_unconfigured`.
3. Else `docker run` with callback env + `OPENAI_API_KEY` + `OPENAI_MODEL`.
4. Runner: `Agent(model=OpenAIModel(...), system_prompt=manifest.system_prompt, callback_handler=None)` one user turn.
5. POST complete; worker reconciles timeout / missing callback as today.

## Modules

- [`runner/agent_run.py`](../../runner/agent_run.py) — parse manifest, invoke agent, build callback JSON (testable).
- [`runner/entrypoint.py`](../../runner/entrypoint.py) — env, HTTP POST.
- [`api/src/app/worker/docker_runner.py`](../../api/src/app/worker/docker_runner.py) — extra env vars.
- [`api/src/app/core/config.py`](../../api/src/app/core/config.py) — key, model, image alias, timeout.

## Tests

Unit: docker command includes `OPENAI_MODEL` and key env when provided; manifest JSON has no `sk-`; worker helper returns None without key; runner payload builders. CI does not call OpenAI (`@pytest.mark.llm` optional).
