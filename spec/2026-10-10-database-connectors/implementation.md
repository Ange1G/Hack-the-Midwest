# Implementation record: Database connectors (external and provisioned)

## Status

Implemented 2026-10-10 as the third commit on top of [connectors](../2026-10-10-connectors/implementation.md). Awaiting human review (credential handling, SSRF rules, Docker provisioning and container isolation).

## What was implemented

- **Contract** (`app/domains/primitives/database_contract.py`): `type: "database"`; `config.mode` `external` or `provisioned` (discriminated union); engines `postgres`, `mysql`, `mongodb`, `redis` with per-engine ports, provisionable versions, memory floors and naming rules; `credentials { username, password }` checked against the mode and engine.
- **Network guard** (`network.py`): `PublicHost` for bare hosts (same rules as URLs); `resolve_public_addresses` re-checks resolved addresses when a run starts. `ensure_public_target` now shares the host logic (behaviour unchanged, HTTP/MCP tests unchanged).
- **Registry:** `database` entry; `NESTED_TAGS` so error paths read `config.host`, not `config.external.host` (`describe_validation_errors(nested_tags=...)`).
- **Repository:** `get_with_secrets(owner, ids)`, owner-scoped, for code that executes connectors.
- **Runtime** (`app/runtime/`, new):
  - `commands.py`: `SubprocessRunner` (secrets via child environment only; runs in a thread so it works under any event loop).
  - `database_provisioner.py`: `DockerDatabaseProvisioner` with `start`, `release`, `stop_agent`, `remove_agent`.
  - `agent_databases.py`: `agent_databases()` context manager and `DatabaseConnection` (URL builder per engine, `describe()` for agent-visible information).
  - `databases_cli.py`: `up` / `stop` / `remove` for one agent.
- `SecretCipher.derive_secret` (HKDF-SHA256) for passwords of `agent`-lifecycle databases.
- Settings `DATABASE_PROVISIONER_NETWORK`, `DATABASE_PROVISIONER_READY_TIMEOUT`; README and `.env.example` sections.

No migration: database connectors use the existing `connectors` / `connector_secrets` tables, and containers are found by deterministic name and labels.

## Original code untouched

Against the team's commit `bf8f88e`, team files still have 0 deleted lines. This commit edits only files introduced by the two earlier patches (`validation_errors.py`, `secrets.py`, `network.py`, `registry.py`, connectors `repository.py` / `service.py`, and their tests) and appends to `core/config.py`, `api/README.md`, `api/.env.example`.

## Decisions

As in `plan.md`, plus:

- **Early exit reporting.** A container that exits before Docker assigns its port used to surface as "docker port failed"; the provisioner now checks the container state and reports "stopped while starting; see `docker logs <name>`" (found with the stand-in images below).
- **Nested tags are stripped only when they are not field names.** Stripping every tag anywhere removed the `database` field from paths like `config.database`, because `database` is also a connector type; top-level tags are stripped only in first position.
- **Credentials error loading uses `raise ... from None`.** A Pydantic `ValidationError`'s text includes input values; it is never chained into errors that may be shown to users.

## Test results

```text
uv run pytest -q -rs
258 passed, 5 skipped   (the 5 are the opt-in RUN_DOCKER_TESTS live tests)
uv run alembic check
No new upgrade operations detected.
```

Docker behaviour was checked against a real Docker 29.8 daemon. The workspace could not pull images from Docker Hub, so the engine images were replaced by stand-ins with the same tags (a static binary that refuses to start without its password variable, listens on the engine port after a delay, answers the readiness commands, and reports a hash of the password it received). Observed:

- `docker run` flags as specified: memory = swap = 512 MiB, 1 CPU, PID limit 256, `no-new-privileges`, `unless-stopped` for agent lifecycle, port bound to `127.0.0.1` only, five `constitution.*` labels, labelled named volume.
- The password reached each container through the environment (hash matched) and did not appear in the host process list.
- Reuse returns the same container; a stopped agent database is started again (with a new host port, which is re-read); run databases are removed with their volumes on release and on Ctrl+C of `databases_cli up`; redis runs as uid 999; mongodb's check uses the container address; network mode creates an `--internal` network and publishes nothing; `stop` / `remove` affect only the given agent and leave no volumes.
- End to end through the API: three provisioned connectors created with `POST /connectors`, an agent referencing them, `databases_cli up` printed working URLs and removed the run database at the end.

Not verified here: the real engine images (env variable names, readiness commands, start-up under the memory limit). `tests/docker/test_live_database_provisioning.py` covers that on a machine that can pull images: `RUN_DOCKER_TESTS=1 uv run pytest tests/docker -v`.

## Known limitations and follow-ups

- **Nothing calls `agent_databases()` yet** besides the CLI: the run/queue/worker slice must call it at run start and build database tools from the returned connections (read-only sessions for `readOnly`, statement timeouts from `options.timeout`, row limits).
- **External connections re-resolve the host** unless the tool layer connects to `DatabaseConnection.addresses`; drivers differ in how they take an address plus a TLS server name.
- **`agent` databases keep running between runs** and are only stopped/removed explicitly; an idle reaper and removal on agent delete (no delete endpoint yet) are needed.
- **Connector update/delete** do not exist; when added, changing a provisioned connector's engine or version must remove or migrate its existing container.
- **Provisioning needs the Docker CLI** where runs start. In production on Akamai, run the worker on the Docker host (or with a remote `DOCKER_HOST`) and set `DATABASE_PROVISIONER_NETWORK` to the network agent containers use. Agents must never receive Docker access.
- **MySQL at 512 MiB** is near its idle footprint; raise `memoryMb` if it is killed at start-up (reported as "stopped while starting").
