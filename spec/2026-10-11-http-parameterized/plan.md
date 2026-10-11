# Plan: Parameterized HTTP connectors

## Contract

Extend [`HttpConfig`](../../api/src/app/domains/primitives/http_contract.py):

- `queryParams`: optional non-empty list of param names.
- `bodyParams`: optional non-empty list; rejected on GET.

No migration: stored JSONB contracts omit the fields today; defaults stay `None`.

## Bundle and runner

[`_http_tool_spec`](../../api/src/app/worker/bundle.py) copies allowlists onto the runner spec as `query_params` / `body_params`.

[`execute_http_tool`](../../runner/http_tools.py) accepts `query` and `body`, validates keys, appends query with `urllib.parse`, merges POST JSON. [`runner/entrypoint.py`](../../runner/entrypoint.py) registers a parameterized `@tool` only when an allowlist is present.

## Frontend

HTTP draft fields: comma-separated query params (always) and body params (POST). Zod create schema mirrors the contract.

## Tests (red-green)

- Contract: accept/reject allowlists; GET + `bodyParams` fails.
- Runner: append query, reject unknown keys, reject URL-key override, merge POST body.
- Bundle: allowlists appear in `HTTP_TOOLS_JSON`; secrets still omitted.
- FE: create schema + connector form send `queryParams`.
