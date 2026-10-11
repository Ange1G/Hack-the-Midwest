# Task: Database connectors (external and provisioned)

## Problem

AGENTS.md lists database connectors as a required primitive. Users need two things:

1. Let an agent use a database they already run, by passing its connection details and credentials.
2. Have a database spun up for the agent when the agent starts, without running one themselves.

Builds on [2026-10-10-connectors](../2026-10-10-connectors/task.md): a database connector is another connector type in the same `connectors` table, following the same generic contract, and agents reference it by ID.

## Contract

Generic contract with `type: "database"`. `config.mode` selects one of two shapes.

External (user-run database; credentials passed in the contract):

```text
{
  type: "database", contractVersion: 1, name, description?, options?,
  credentials: { username?: string, password: string },
  config: {
    mode: "external",
    engine: "postgres" | "mysql" | "mongodb" | "redis",
    host: string,                 // public hostname or IP
    port?: int,                   // default per engine
    database?: string,            // required except for redis (index "0".."15")
    tls?: "verifyFull" | "require",   // default verifyFull
    caCertificate?: string,       // PEM, for managed databases with a private CA
    access?: "readOnly" | "readWrite" // default readOnly
  }
}
```

Provisioned (platform starts a database for the agent):

```text
{
  type: "database", contractVersion: 1, name, description?, options?,
  credentials?: { username?: string, password?: string },   // generated when omitted
  config: {
    mode: "provisioned",
    engine: "postgres" | "mysql" | "mongodb" | "redis",
    version?: string,             // from a fixed list per engine
    database?: string,            // default "agent"; not used by redis
    lifecycle?: "agent" | "run",  // default "agent"
    memoryMb?: int                // 256..2048, default 512
  }
}
```

Lifecycle:

- `agent`: created the first time one of the agent's runs starts, kept (with its data volume) between runs, removed with its data only by an explicit remove.
- `run`: a fresh, empty database for every run, removed with its data when the run ends.

## Goals

1. `POST /api/v1/connectors/{user_sso}` accepts database contracts; credentials are encrypted in `connector_secrets` and masked in responses like other connectors.
2. Agents reference database connectors by ID in `configurations.primitives`, like HTTP connectors.
3. A runtime hook, called when an agent run starts, returns ready-to-use connection details for every database the agent references: it starts provisioned databases (Docker) and checks external ones, and it tears down `run` databases when the run ends.
4. `GET /api/v1/connector-types` includes `database` and its JSON Schema.

## Constraints

See [AGENTS.md](../../AGENTS.md). Specifically:

- External hosts are user-controlled targets: the same SSRF rule as HTTP and MCP (no private, loopback, link-local or internal names at save time; resolved addresses re-checked when the run starts).
- Credentials never appear in logs, responses, error messages, or process arguments.
- Credentials over the internet are encrypted: external databases require TLS.
- Least privilege: external databases default to `readOnly`.
- Provisioned databases get resource limits, no privilege escalation, and are reachable only from the platform host (loopback) or an internal Docker network.
- The provisioner runs in trusted platform code (worker), never inside a user agent; agents never get Docker access.
- Original team source lines stay untouched (additive only).

## Acceptance criteria

1. Database contracts validate the generic fields like the other types, and the per-mode and per-engine rules above. Unknown modes, engines and versions, missing required fields, internal hosts, and plaintext TLS settings are rejected with field paths that match the submitted JSON.
2. External: password always required; username required except for redis; database required for postgres, mysql and mongodb. Provisioned: credentials optional; username must be identifier-like, not allowed for redis, and not `root` for mysql; supplied passwords are at least 12 characters.
3. The connectors API stores database connectors with encrypted credentials and masked responses (`201`, `409`, `422`, `503` as for other types).
4. Agents can reference database connectors; `allowedTools` on a database reference is rejected.
5. `agent_databases(agent, ...)` yields one connection per referenced database connector, keyed by connector name, with engine, host, port, database, username, password, TLS mode and access, and a URL builder. Provisioned databases are started (or reused for `lifecycle: agent`) and waited on until ready; `run` databases are removed afterwards, including when the run fails or provisioning of another database fails. External hosts that resolve to blocked addresses are refused.
6. Docker containers carry labels identifying platform, agent and connector; secrets are passed through the environment, not command-line arguments; memory, CPU and PID limits and `no-new-privileges` are set; ports are published on 127.0.0.1 only, or not published when an internal Docker network is configured.
7. A command-line entry point starts an agent's databases, prints their connection details (passwords hidden unless requested) and tears down on exit; it can also stop or remove an agent's persistent databases.
8. All existing tests pass unchanged; new unit tests cover the contract, provisioner commands and lifecycle with a fake Docker; integration tests cover the API.

## Out of scope

Agent tools that query databases (the runner will build these on the returned connections), connector update/delete endpoints, the run/queue/worker slice itself, managed-database provisioning on Akamai (Linode Managed Databases take minutes to create, so they suit `external` mode), seeding provisioned databases.
