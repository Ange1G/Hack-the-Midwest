# Implementation: SSL CA bundle for execution containers

## What was implemented

- `RunRequest.ssl_ca_bundle: str | None` — optional field carrying the absolute host path
  to a PEM bundle. Not logged or surfaced in any response.
- `docker_run_command` — when `ssl_ca_bundle` is set, inserts
  `-v <host-path>:/tmp/ca-bundle.pem:ro` and `-e SSL_CERT_FILE=/tmp/ca-bundle.pem` into
  the `docker run` command. No change when the field is absent.
- `Settings.execution_ssl_ca_bundle` — reads `EXECUTION_SSL_CA_BUNDLE` from env/`.env`.
- `loop.process_once` — threads the setting into `RunRequest` before calling the runner.
- `runner/.gitignore` — blocks `*.pem`, `*.crt`, `*.cer`.
- `runner/.dockerignore` — blocks the same patterns so host cert files cannot be
  accidentally `COPY`-d into the image.
- `api/.env.example` — documents the setting with macOS keychain export command and
  production note.

## Decisions

- Container path `/tmp/ca-bundle.pem` was chosen because `/tmp` is the only writable path
  in the read-only container. Docker applies bind mounts after the `--tmpfs /tmp` overlay,
  so the file is accessible inside the container.
- The bundle is never logged, never embedded in `runner_meta`, and never returned to users.
- The runner image itself contains only standard Debian/Mozilla CA roots. No CA material
  is baked into the image; it is always injected at run time from the operator's host.

## Tests

`uv run pytest tests/unit` → **141 passed**.

New tests added to `tests/unit/test_docker_runner.py`:
- `test_docker_command_mounts_ssl_ca_bundle_when_set`
- `test_docker_command_no_ssl_ca_bundle_by_default`

## End-to-end verification (local, 2026-10-10)

Environment: macOS with Colima, corporate network with TLS inspection.

1. Exported macOS keychain: `security find-certificate -a -p ... > ~/mac-ca.pem`
2. Set `EXECUTION_SSL_CA_BUNDLE=/Users/jg96338/mac-ca.pem` in `api/.env`
3. Restarted worker
4. Enqueued execution against `b26099f8-...` (system prompt: "Say hello in one sentence.")
5. Worker claimed, launched container with `-v ~/mac-ca.pem:/tmp/ca-bundle.pem:ro`
6. Container called OpenAI, POSTed callback
7. Polled: `status: succeeded`, `result.output` confirmed, `result.model: gpt-4o-mini`
8. Wall time: ~5 seconds

Prior to this fix: all executions failed in ~5 seconds with
`error_code: llm_error`, `error_message: Connection error.`

## Known limitations / follow-on work

- The bundle path must be an absolute path on the worker host. Relative paths or missing
  files will cause Docker to fail the container with a mount error.
- On Linux Docker (not Colima), `/tmp/mac-ca.pem` may not be reachable from the VM
  filesystem; use a path under `$HOME`.
- On standard production hosts (Akamai Cloud, AWS, etc.) with public CA chains and no TLS
  interception, leave `EXECUTION_SSL_CA_BUNDLE` unset.

---

## Production setup guide

This section describes how to deploy the platform on a production host.

### Architecture

```text
Internet → Load Balancer → API (FastAPI / uvicorn)
                               ↓ (reads queued rows)
                           agent-worker
                               ↓ (docker run)
                           Execution containers
                               ↓ (POST callback)
                           API internal endpoint
```

### Components

| Component | Description |
|-----------|-------------|
| PostgreSQL | Managed (e.g. Akamai Managed DB, RDS) or self-hosted. Port 5432. |
| API | `uvicorn app.main:app --app-dir src --host 0.0.0.0 --port 8000` behind nginx/Caddy with TLS termination. |
| Worker | `uv run agent-worker` as a systemd service or container. Must have Docker socket access to launch containers. |
| Runner image | Built with `docker build -t <registry>/agent-platform-runner:<tag> runner` and pushed to a container registry. |

### Environment variables

#### API process

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ENV` | Yes | Set to `production`. Disables dev `X-Dev-User-SSO` auth header. |
| `DATABASE_URL` | Yes | `postgresql+asyncpg://user:pass@host:5432/agent_platform` |
| `SECRETS_ENCRYPTION_KEY` | Yes | Fernet key for connector credentials. Generate once; store in a secrets manager. Never rotate without re-encrypting all connector secrets. |
| `OPENAI_API_KEY` | Yes | Platform-owned OpenAI key. Never expose to users or log. Store in secrets manager. |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini`. |
| `DEFAULT_PAGE_SIZE` | No | Default 20. |
| `MAX_PAGE_SIZE` | No | Default 100. |

#### Worker process (all API vars plus)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXECUTION_RUNNER_IMAGE` | Yes | `<registry>/<image>:<tag>` — the runner image to pull and run. |
| `EXECUTION_CALLBACK_BASE_URL` | Yes | Internal URL the containers use to reach the API, e.g. `http://api-internal:8000`. Must not be publicly reachable. |
| `EXECUTION_TIMEOUT_SECONDS` | No | Default 120. How long before the worker kills a container. |
| `WORKER_POLL_INTERVAL_SECONDS` | No | Default 1.0. Idle poll frequency. |
| `MAX_ACTIVE_EXECUTIONS_PER_OWNER` | No | Default 5. Per-user concurrency cap; returns HTTP 429 when exceeded. |
| `EXECUTION_SSL_CA_BUNDLE` | No | Absolute path on the worker host to a PEM CA bundle. Set only if the host uses TLS inspection. Leave unset on standard Akamai hosts. |

### Database migrations

Apply all migrations before starting the API or worker:

```bash
cd api && uv run alembic upgrade head
```

Migration chain: `001_agents` → `002_agents_schedule` → `003_connectors` → `004_agent_executions`.

### Runner image

Build and push:

```bash
docker build -t <registry>/agent-platform-runner:<tag> runner
docker push <registry>/agent-platform-runner:<tag>
```

Set `EXECUTION_RUNNER_IMAGE=<registry>/agent-platform-runner:<tag>` on the worker.

### Pre-production security checklist

Before exposing the platform to real users:

- [ ] **Authentication:** Replace `X-Dev-User-SSO` with real SSO. Production auth is not implemented; `APP_ENV=production` only disables the dev header — it does not add real auth.
- [ ] **Credential injection:** OpenAI key and connector credentials are currently Docker `-e` environment variables. A compromised system prompt can attempt to exfiltrate them. Move to Docker secrets or a secrets vault before production.
- [ ] **Egress allowlist:** Execution containers can currently reach any external host. Apply a network policy or egress proxy restricting outbound connections to permitted domains.
- [ ] **Container isolation strategy:** Validate the production container isolation model against the expected threat model per AGENTS.md before allowing untrusted users to execute agents.
- [ ] **Runner image provenance:** Pin the runner image to a digest, not a mutable tag. Pull only from a trusted registry.
- [ ] **Callback URL exposure:** Confirm `EXECUTION_CALLBACK_BASE_URL` is not publicly reachable. Only execution containers should be able to POST to the internal callback endpoint.
- [ ] **Secrets management:** `SECRETS_ENCRYPTION_KEY` and `OPENAI_API_KEY` must come from a secrets manager (e.g. Akamai Secret Manager, HashiCorp Vault), not `.env` files on disk.
- [ ] **Database:** Enable TLS on the PostgreSQL connection string. Use a dedicated database user with least privilege.
- [ ] **API TLS:** Terminate TLS at the load balancer or reverse proxy. Do not run uvicorn with a self-signed cert.
- [ ] **Worker broker:** The PostgreSQL `SELECT FOR UPDATE SKIP LOCKED` queue is sufficient for a single worker. Add a durable broker (Redis + Celery or similar) before running multiple concurrent workers.
- [ ] **Retries and cancellation:** Not implemented. Plan explicit retry and cancellation behavior before production scale.
- [ ] **MCP tools:** MCP connector references are stored but not executed. Do not advertise MCP capability to users until execution is implemented and security-reviewed.
