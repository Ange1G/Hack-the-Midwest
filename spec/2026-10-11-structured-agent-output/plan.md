# Plan: Structured final output

## API

- `app/domains/agents/output_schema.py`: `OutputSchema` annotated type — size cap, `Draft202012Validator.check_schema`, reject non-local `$ref`.
- `AgentConfigurations.output_schema` (alias `outputSchema`), stored in the existing JSONB column (no migration).
- `agent_manifest` adds `output_schema` when set.
- `chains/handoff.output_from_result` prefers `json.dumps(result["parsed"])` (compact).

## Runner

- `runner/structured_output.py`: `schema_instructions` (appended to the system prompt with the compact schema), `parse_structured_output` (strip one code fence, `json.loads`, validate, sorted bounded errors), `apply_output_schema` (success body → `result.parsed`, or failed body that keeps `result`).
- `agent_run.run_turn` applies it. Validation happens after the model finishes, so it cannot be skipped by the model.

## Dependency

`jsonschema` (>=4.23,<5) in `api/pyproject.toml` and `runner/requirements.txt`. It is the reference Python implementation; writing a validator would be worse. Remote `$ref` retrieval is off by default in this version and also rejected at save time.

## Frontend

- Zod: `executionResultSchema.parsed`, `agentConfigurationsSchema.outputSchema`, `agentInputSchema.configurations.outputSchema`, `OUTPUT_SCHEMA_ERROR_CODES`.
- Agent form: "Structured output" section with a JSON Schema textarea; client-side JSON/object check only.
- Run details: "Output did not match the schema" notice (multi-line), "Structured output" block with pretty JSON.

## Tests

Runner unit (`test_structured_output.py`), configuration/manifest unit (`test_agent_output_schema.py`), API integration (`test_agent_output_schema_api.py`), handoff unit, Vitest for the form and run view.
