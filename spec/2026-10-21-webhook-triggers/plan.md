# Plan: Webhook triggers

## 1. Persistence

- Tables: `webhooks` (`id`, `owner_user_sso`, `target_agent_id`, `secret_ciphertext`, `created_at`, disabled flag).
- Migration + repository.

## 2. API

- Authenticated CRUD: `/api/v1/webhooks/{user_sso}` (list, create, delete).
- Unauthenticated fire: `POST /api/v1/hooks/{webhook_id}` (separate prefix to avoid SSO path confusion).

## 3. Signature

- HMAC-SHA256 over raw body with decrypted secret; header `X-Webhook-Signature` (hex or `sha256=` prefix—document).

## 4. Fire handler

- Decrypt secret, verify, parse body → `input` string (MVP: entire body as UTF-8 string if JSON, or `JSON.stringify` compact).
- `ExecutionService.enqueue` with stored `input`.
- Rate limit: in-memory token bucket per webhook id or DB counter (MVP acceptable).

## 5. Tests

- Unit: signature verify, owner check.
- Integration: create webhook + agent, fire, assert queued execution with input.

## Validation

```bash
cd api && uv run pytest tests/integration/test_webhooks_api.py -q
```
