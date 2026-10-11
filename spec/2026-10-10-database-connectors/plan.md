# Plan: Database connectors (external and provisioned)

## Modules

```text
app/domains/primitives/
  database_contract.py   DatabaseContract: engines, modes, versions, per-engine defaults and rules
  network.py             + PublicHost (save-time host check), resolve_public_addresses (run-time check)
  registry.py            + "database" ConnectorType; UNION_TAGS for error paths

app/domains/connectors/
  repository.py          + get_with_secrets(owner, ids): connectors plus their ciphertexts

app/runtime/                         trusted platform code that runs agents (worker side)
  commands.py            CommandRunner protocol; SubprocessRunner (subprocess in a thread)
  database_provisioner.py  DockerDatabaseProvisioner: start / release / stop_agent / remove_agent
  agent_databases.py     DatabaseConnection, agent_databases() async context manager
  databases_cli.py       python -m app.runtime.databases_cli up|stop|remove <agent_id>
```

Additive changes elsewhere: `core/config.py` (provisioner settings), `core/secrets.py` (`derive_secret`), `common/validation_errors.py` (strip union tags at any depth), `connectors/service.py` (pass `UNION_TAGS`).

No migration: database connectors are rows in `connectors` / `connector_secrets`, and provisioned containers are tracked by Docker labels and deterministic names.

## How an agent run uses it

```python
async with agent_databases(agent, connectors=repo, cipher=cipher, provisioner=provisioner) as dbs:
    dbs["scratch"].url()        # postgresql://agent:...@127.0.0.1:49153/agent?sslmode=disable
    dbs["orders_db"].read_only  # True
    # build the agent's database tools from these, run the agent
# run-lifecycle databases are removed here, even if the run raised
```

1. Load the agent's referenced connectors of type `database` (owner-scoped), decrypt their credentials, and re-validate each contract.
2. External: resolve the host and refuse it if any address is private, loopback, link-local, reserved or multicast.
3. Provisioned: start or reuse the container, wait until the engine answers, return host and port.
4. On exit (normal, exception or cancellation): remove `run` databases with their data. `agent` databases keep running for the next run.

## Docker provisioning

| engine | image | port | data path | readiness check (inside container) |
| --- | --- | --- | --- | --- |
| postgres | `postgres:{15,16,17}-alpine` | 5432 | `/var/lib/postgresql/data` | `pg_isready -h 127.0.0.1` |
| mysql | `mysql:{8.0,8.4}` | 3306 | `/var/lib/mysql` | `mysqladmin ping -h 127.0.0.1` |
| mongodb | `mongo:{7.0,8.0}` | 27017 | `/data/db` | `mongosh` ping on the container's network address |
| redis | `redis:7-alpine` | 6379 | `/data` | `redis-cli ping` with `REDISCLI_AUTH` |

Each engine's image initialises its server on the first start from environment variables (`POSTGRES_*`, `MYSQL_*`, `MONGO_INITDB_*`; redis gets `--requirepass` from `$REDIS_PASSWORD` through a shell, running as the image's `redis` user). The readiness checks only pass on the final server, not on the temporary one the images run during initialisation (postgres: socket only; mysql: `--skip-networking`; mongodb: bound to 127.0.0.1, hence the network-address check).

`docker run` flags: `--label constitution.managed=database`, `constitution.agent`, `constitution.connector`, `constitution.lifecycle`, `constitution.engine`; `--memory`/`--memory-swap` (memoryMb), `--cpus 1`, `--pids-limit 256`, `--security-opt no-new-privileges`; `--publish 127.0.0.1::<port>` or `--network <internal network>`; `--env NAME` without values (values come from the child process environment, so they never appear in process arguments).

Names: `constitution-db-<agentId>-<connectorId>` for `agent` lifecycle (deterministic, so a later run finds it), plus a random suffix for `run` lifecycle. `agent` databases use a named, labelled volume and `--restart unless-stopped`.

Passwords: supplied credentials when present; otherwise `run` databases get a random password and `agent` databases a password derived with HKDF from `SECRETS_ENCRYPTION_KEY`, the agent ID and the connector ID. Derivation means nothing extra is stored and the next run gets the same password; losing the key has the same effect as losing it for stored credentials.

Settings: `DATABASE_PROVISIONER_NETWORK` (unset: publish on 127.0.0.1 for local development; set: attach to that Docker network, created as `--internal` if missing, and connect by container name), `DATABASE_PROVISIONER_READY_TIMEOUT` (seconds, default 90).

## Decisions

- **One `database` type with `config.mode`** instead of `database_external` / `database_provisioned` types: the agent-facing behaviour (a database with an engine) is the same, and the mode is a discriminated union, so each mode still has a precise JSON Schema.
- **TLS required for external databases.** `verifyFull` by default; `require` (encrypt without certificate verification) is allowed for providers with self-signed certificates; plaintext is not.
- **`readOnly` by default** for external databases. Enforcement belongs to the tool layer (read-only transactions for SQL engines); the real guarantee is a read-only database user, which the README recommends.
- **Provisioned databases are trusted platform infrastructure**, started by the worker, not by the agent; agents receive connection details only.
- **`agent` databases keep running after a run** instead of being stopped: two runs of the same agent may overlap, and stopping after one would break the other. `stop` / `remove` are explicit (CLI now; agent delete endpoint later).
- **No Linode Managed Database provisioning:** creation takes minutes, far longer than a run's start-up. Akamai managed databases are supported as `external` databases (TLS with `caCertificate`).

## Validation strategy

TDD. Unit: contract rules (both modes, every engine, rejections and error paths), registry/catalog, secret derivation, Docker provisioner against a fake command runner (exact commands, secrets only in the environment, readiness polling, failure clean-up, reuse, name conflicts, network mode, stop/remove filters), and `agent_databases` with a fake provisioner (connections, external address checks, clean-up on success, failure and partial provisioning). Integration (PostgreSQL): connectors API with database contracts, encrypted rows, agents referencing database connectors, repository secret loading is owner-scoped. Docker CLI behaviour checked against a real Docker daemon with stand-in images; an opt-in live test (`RUN_DOCKER_TESTS=1`) provisions real engine images on a developer machine.
