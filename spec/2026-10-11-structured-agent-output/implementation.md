# Implementation: Structured final output

**Status:** Implemented.

## What landed

- API: `OutputSchema` validation (`agents/output_schema.py`), `AgentConfigurations.output_schema`, manifest `output_schema`, chain handoff prefers `result.parsed`.
- Runner: `structured_output.py`, wired into `agent_run.run_turn`; Dockerfile copies the module; `jsonschema` added to `requirements.txt`.
- Frontend: agent form "Structured output" section, run details structured block and schema-failure notice, mock store keeps `outputSchema`.

## Error codes

| Code | Meaning |
| --- | --- |
| `output_invalid_json` | Reply was not JSON (after stripping one code fence) |
| `output_schema_mismatch` | JSON did not match; message lists up to 5 `$.path: reason` lines |
| `output_schema_invalid` | Stored schema no longer validates (should not happen for schemas saved through the API) |

## Tests observed

- `cd api && uv run pytest -q` — **555 passed, 5 skipped** (opt-in Docker tests).
- `cd fe && npx vitest run` — **161 passed**; `npm run typecheck` clean; Biome clean on changed files.
- Runner image built locally; `structured_output` imports and parses a fenced reply inside the container.

## Known limits / follow-ups

- No live end-to-end run against OpenAI was performed in this change.
- No automatic retry asking the model to repair a non-matching reply.
- If the memory feature (in progress in `2026-10-11-agent-memory-delegates`) attaches memory writes after `run_turn`, it must only do so for `succeeded` payloads: a schema failure turns the body into `failed`, and the callback schema rejects memory on failed runs.
