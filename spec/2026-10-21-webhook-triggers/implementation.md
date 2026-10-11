# Implementation: Webhook triggers

**Status:** Implemented.

## What landed

- `webhooks` table (007): owner, `target_agent_id` (CASCADE on agent delete), encrypted HMAC secret, `disabled`.
- Authenticated CRUD: `POST/GET /api/v1/webhooks/{user_sso}`, `DELETE /api/v1/webhooks/{user_sso}/{webhook_id}`.
- Public fire: `POST /api/v1/hooks/{webhook_id}` with `X-Webhook-Signature: sha256=<hex>` (bare hex accepted).
- Body → execution `input`: compact JSON if the body is JSON, otherwise UTF-8 text.
- Secret shown once on create; list returns `********`. Invalid signature is 401 and creates no row.
- In-memory per-webhook rate limit (`WEBHOOK_RATE_LIMIT_PER_MINUTE`, default 30) and max body (`WEBHOOK_MAX_BODY_BYTES`, default 20,000).

## Validation

```bash
cd api && uv run pytest tests/unit/test_webhook_signature.py tests/unit/test_webhook_payload.py tests/unit/test_webhook_rate_limit.py tests/unit/test_webhook_service.py tests/integration/test_webhooks_api.py -q
```
