# Task: Outbound notification connector

**Status:** Implemented. See `implementation.md`.

## Problem

Inbound webhooks start runs, but agents cannot send a structured notification to a user-chosen destination (Slack incoming webhook, pager, generic POST). Output is text in the run view only.

## Goals

1. New connector type `notification`: fixed destination URL, method POST.
2. Model fills a JSON body from an allowlist of keys (same discipline as parameterized HTTP).
3. Optional static header credentials, stored like HTTP connectors.
4. Appear in `result.tool_calls` with status and truncated response; never echo secrets.

## Constraints

- Fixed URL: `PublicHttpUrl`; no URL override; no extra hosts.
- The destination URL is a secret (Slack incoming webhook URLs embed a token), so it is a credential (`credentials.webhookUrl`): encrypted at rest, never returned, never shown to the model.
- Body size cap aligned with HTTP tools (8000 characters).
- Timeouts and retries via existing `options`.
- Do not send platform secrets or other connectors' credentials in the body.

## Acceptance criteria

1. Agent with a notification connector can POST `{ "text": "..." }` to the stored URL when `text` is allowlisted.
2. Unknown body keys are rejected without sending.
3. Credentials, including the destination URL, stay out of `HTTP_TOOLS_JSON`, model-visible tool text, and callback results.
4. Frontend can create the connector and attach it like HTTP.

## Out of scope

Email SMTP, SMS providers, inbound webhook changes, templating languages, outbound HMAC signing.
