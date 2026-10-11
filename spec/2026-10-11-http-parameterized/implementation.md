# Implementation: Parameterized HTTP connectors

## What shipped

- `HttpConfig` accepts optional `queryParams` and POST-only `bodyParams`.
- Worker bundle copies allowlists onto runner specs as `query_params` / `body_params`.
- Runner `execute_http_tool` appends allowlisted query values, merges POST body keys, and rejects unknown keys, URL overrides, and query keys already fixed on the stored URL.
- Parameterized Strands tools are registered only when an allowlist is present; existing connectors stay zero-argument.
- Dashboard HTTP form: comma-separated query/body param names with helper text.

## Tests observed

- `cd api && uv run pytest tests/unit` — **358 passed**
- `cd api && uv run pytest tests/integration/test_connectors_api.py` — **10 passed**
- `cd fe && npm test && npm run typecheck` — **152 passed**, typecheck clean

## Known limits

- No path templates or extra HTTP methods.
- Query values are scalars only.
- Browser walkthrough of the new form fields was not run (no browser tools in this session); covered by Vitest and the demo e2e spec.
