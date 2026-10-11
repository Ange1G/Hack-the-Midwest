# Task: Parameterized HTTP connectors

## Problem

HTTP tools are zero-argument: the runner always calls the stored method/URL/(optional static POST body). One connector equals one exact request. Search, pagination, and most REST APIs need many connectors or an MCP server.

## Goals

1. Optional allowlists on the HTTP contract: `queryParams` and (POST only) `bodyParams`.
2. When set, the Strands HTTP tool accepts `query` and/or `body` objects. Only allowlisted keys are sent.
3. The model cannot change scheme, host, or path. Existing query keys on the stored URL cannot be overridden.
4. Connectors without allowlists stay zero-argument (backward compatible).

## Constraints

- SSRF: reuse `PublicHttpUrl`; reject URL override (existing `UrlOverrideError`).
- Query values: scalars only; max 1024 characters each.
- Body: JSON object overlay on a dict payload (or the whole body when there is no static payload); max 8000 serialized characters.
- Max 20 names per allowlist; names match `^[A-Za-z][A-Za-z0-9_\-]{0,63}$`.
- GET cannot declare `bodyParams` or accept a body.

## Acceptance criteria

1. GET with `queryParams: ["q"]` and `query: {"q": "open"}` hits the stored URL with `?q=open`.
2. Unknown query/body keys are rejected without sending a request.
3. Query keys already present on the connector URL cannot be overridden.
4. Existing HTTP connectors without allowlists still produce a no-arg tool and pass current tests.
5. Frontend HTTP form can set comma-separated query/body param names.

## Out of scope

OpenAPI import, extra HTTP methods, path templates, knowledge/notification connectors.
