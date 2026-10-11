# Implementation: Outbound notification connector

**Status:** Implemented.

## What landed

- `NotificationContract` (`api/src/app/domains/primitives/notification_contract.py`), registered in `registry.CONNECTORS`. Destination URL is `credentials.webhookUrl` (encrypted, masked).
- Worker `build_http_tool_bundle` emits `kind: "notification"` specs without a URL; fails closed with `notification_destination_missing`.
- Runner `execute_notification_tool`, `summarize_notification_call`, `destination_label` (`runner/http_tools.py`); `execute_http_tool` gained `display_url` so the status line can show the host only. Entry point registers `<name>(body: dict)`.
- Frontend: `notificationConnectorCreateSchema`, `NotificationFields`, picker + list card, MSW masking.

## Tests observed

- `cd api && uv run pytest -q` — **555 passed, 5 skipped** (skips are the opt-in Docker provisioning tests).
- New: `test_notification_contract.py`, `test_notification_tools.py`, `test_notification_tool_bundle.py`, `test_runner_notification_tool.py`, notification cases in `test_connectors_api.py`, registry catalog update.
- `cd fe && npx vitest run` — **161 passed**; `npm run typecheck` clean.
- Runner image built locally; Strands `@tool` registers the notification tool with the generated description and required `body`.

## Known limits

- No connect-time DNS re-check in the runner (same as HTTP connectors today).
- Not exercised against a live Slack webhook in this change.
- Connector deletion is the only way to change a destination (connectors are create-only).
