# Task: SSL CA bundle for execution containers

## Problem

Execution containers running `agent-platform-runner:local` on macOS with Colima could not
reach OpenAI's API (`api.openai.com:443`). The failure mode was:

```
httpcore.ConnectError: [SSL: CERTIFICATE_VERIFY_FAILED]
certificate verify failed: unable to get local issuer certificate
```

The host could reach OpenAI (HTTP 200). The container could not, because Python's `ssl`
module uses the container's CA bundle (standard Debian roots), which does not include the
corporate TLS-intercept root that the host trusts.

Workers launched containers without any CA bundle override, so every execution failed with
`error_code: llm_error` and `error_message: Connection error.` within ~5 seconds.

## Goals

1. Let operators supply a PEM CA bundle from the host. The worker must volume-mount it
   into every execution container and configure Python/httpx to use it via `SSL_CERT_FILE`.
2. Require no changes when running on standard production hosts where the container's
   default CA bundle is sufficient.
3. Keep the host CA bundle out of the runner image and out of source control.
4. Make the setting discoverable via `api/.env.example`.

## Acceptance criteria

- `EXECUTION_SSL_CA_BUNDLE=/path/to/bundle.pem` in worker env causes the bundle to be
  mounted read-only into containers at `/tmp/ca-bundle.pem` with `SSL_CERT_FILE` set.
- When the setting is absent or empty, no volume mount and no `SSL_CERT_FILE` are added.
- `docker_run_command` unit tests cover both cases.
- `runner/.gitignore` and `runner/.dockerignore` block `*.pem` files from git and the image.
- The `api/.env.example` documents the setting with the macOS keychain export command.

## Out of scope

- Baking CA bundles into the runner image.
- Production credential injection (Docker secrets, vault) — tracked as a separate limitation.
- MCP tool execution — separate feature.
