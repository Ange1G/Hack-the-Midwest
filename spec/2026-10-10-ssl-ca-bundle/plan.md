# Plan: SSL CA bundle for execution containers

## Root cause

Corporate TLS-intercepting proxies (Zscaler, Netskope, etc.) re-sign all HTTPS connections
with a custom root CA that the host OS trusts but the container does not. The runner image
(`python:3.12-slim`) ships only standard Debian/Mozilla CA roots. On affected hosts, every
container HTTPS connection fails SSL verification.

Installing `ca-certificates` (Debian package) does not help because the corporate root is
not in the Debian bundle — it is only in the macOS Keychain.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| Bake bundle into image | Simple | Commits personal/corp CA to source control; breaks on other machines |
| Volume-mount at run time from worker | No secrets in image; operator-controlled | Requires a setting; adds a volume mount per container |
| `REQUESTS_CA_BUNDLE` / `SSL_CERT_FILE` env only | Simpler | Still needs the file accessible inside the container |
| Disable SSL verification | One line | Security violation; never acceptable |

**Decision:** volume-mount from worker, configured via `EXECUTION_SSL_CA_BUNDLE`.

## Implementation steps

### 1. `api/src/app/worker/runner.py` — `RunRequest`

Add optional field:

```python
ssl_ca_bundle: str | None = None
```

Documented as the absolute path on the **host** to a PEM bundle. Not logged.

### 2. `api/src/app/worker/docker_runner.py` — `docker_run_command`

When `request.ssl_ca_bundle` is set:

```python
volume_args = ["-v", f"{request.ssl_ca_bundle}:/tmp/ca-bundle.pem:ro"]
env.append("SSL_CERT_FILE=/tmp/ca-bundle.pem")
```

Volume args are inserted before `-e` flags in the command. Image remains last.

### 3. `api/src/app/core/config.py` — `Settings`

```python
execution_ssl_ca_bundle: str | None = None
```

Env var: `EXECUTION_SSL_CA_BUNDLE`. Default `None` (no mount).

### 4. `api/src/app/worker/loop.py` — `process_once`

Thread `settings.execution_ssl_ca_bundle` into `RunRequest.ssl_ca_bundle`.

### 5. `api/.env.example`

Document the setting with the macOS `security find-certificate` export command and note
that it should be left unset on standard production hosts.

### 6. `runner/.gitignore` and `runner/.dockerignore`

Block `*.pem`, `*.crt`, `*.cer` so host CA bundles cannot be committed or baked in.

### 7. Unit tests

Two new cases in `tests/unit/test_docker_runner.py`:
- `test_docker_command_mounts_ssl_ca_bundle_when_set`: asserts `-v` and `SSL_CERT_FILE`
- `test_docker_command_no_ssl_ca_bundle_by_default`: asserts neither is present

## Container path choice

`/tmp/ca-bundle.pem` is inside the tmpfs created by `--tmpfs /tmp`. Docker processes bind
mounts after the tmpfs overlay, so the file is accessible. Mount ordering:
`--tmpfs /tmp` first, then `-v host:/tmp/ca-bundle.pem:ro` overlays on top.

## Validation

- Run unit tests: both new cases pass.
- From `api/`, export macOS keychain and test manually inside a container.
- Set `EXECUTION_SSL_CA_BUNDLE=~/mac-ca.pem` in `.env`, restart worker, enqueue a run,
  confirm `status: succeeded`.
