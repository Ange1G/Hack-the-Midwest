# Plan: Outbound notification connector

## Decision

Distinct type (`notification`) rather than HTTP POST + `bodyParams`. Reasons: catalog copy aimed at Slack/pagers, POST-only contract, and above all the destination URL is a credential. HTTP connectors keep `config.URL` in plaintext and echo it in tool results; that is wrong for Slack-style URLs.

## Contract

```json
{
  "type": "notification",
  "contractVersion": 1,
  "name": "slack_alerts",
  "credentials": { "webhookUrl": "https://hooks.slack.com/services/…", "xApiKey?": "…", "authorizationHeader?": "…" },
  "config": { "bodyParams": ["text"], "payload?": { "username": "Agent" } },
  "options?": { "timeout": 5000, "retries": 1 }
}
```

- `credentials.webhookUrl` is required and validated as `PublicHttpUrl` (SSRF save-time check).
- `bodyParams` is required (1–20 identifier-like names). `payload` is an optional object of fixed keys; `bodyParams` may not repeat its keys so fixed fields stay fixed. Payload JSON ≤ 8000 characters.

## Execution

- Worker: `build_http_tool_bundle` includes notification connectors. The spec carries `kind: "notification"`, `method: POST`, `body_params`, `payload`, timeouts — no URL. The URL travels in `HTTP_CREDENTIALS_JSON` with the header credentials. A connector without a stored URL fails the run closed (`notification_destination_missing`).
- Runner: `execute_notification_tool` reads the URL from credentials, rejects an empty body and unknown keys (reusing `execute_http_tool`'s merge), and returns/records only `scheme://host[:port]`. httpx errors are re-raised without the URL.
- Strands tool: `<name>(body: dict)` with a description listing the allowed keys.

## Security

Same as HTTP plus: destination never in specs, model-visible text, `tool_calls`, or API responses. JSON body only (`Content-Type: application/json`).

## Frontend

Type picker card, destination URL (helper: stored encrypted), "Fields the agent fills" (default `text`), optional fixed JSON, header credentials. Connector list card with bell icon.
