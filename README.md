# Agent Platform

A multi-tenant platform for building, configuring, and running user-defined AI agents in isolated execution environments.

The platform provides agent orchestration, reusable tools, integrations, distributed execution, and security monitoring. Users define their own agent use cases and supply the configuration and credentials required to connect their agents to external services.

## Overview

### Core capabilities

- **Agent management:** Create, configure, execute, and monitor custom agents.
- **Agent orchestration:** Use AWS Strands Agents to orchestrate agent behavior and tool interactions.
- **Isolated execution:** Run user agents in Docker containers hosted on Akamai Cloud infrastructure.
- **Tool primitives:** Provide reusable HTTP, MCP, database, and other integration capabilities.
- **Bring-your-own integrations:** Connect user-provided MCP servers, databases, and external services using user-supplied configuration and credentials.
- **Distributed execution:** Execute long-running jobs asynchronously using a distributed task queue.
- **Security monitoring:** Monitor executions for suspicious behavior, prohibited actions, and policy violations.
- **Execution observability:** Track execution status, results, errors, and relevant security findings.

## Architecture

### High-level system

```text
                        Web Application
                     React / TanStack / shadcn
                               |
                               v
                         FastAPI API
                               |
                +--------------+--------------+
                |              |              |
                v              v              v
          PostgreSQL      Agent Service    Task Queue
                               |              |
                               v              v
                        AWS Strands       Workers
                          Agents              |
                                              v
                                    Akamai Cloud Hosting
                                              |
                                              v
                                    Isolated Docker
                                      Containers
                                              |
                         +--------------------+------------------+
                         |                    |                  |
                         v                    v                  v
                     HTTP Tools          MCP Servers       Databases
                                       User-provided      User-provided
```

This diagram represents the intended logical architecture, not a finalized deployment topology.

### Technology stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, TanStack, shadcn/ui |
| API | Python, FastAPI |
| Agent framework | AWS Strands Agents |
| Database | PostgreSQL |
| Execution isolation | Docker containers |
| Hosting | Akamai Cloud |
| Testing | Vitest, Playwright, pytest |

The distributed task queue, message broker, container scheduling strategy, and production deployment topology are implementation decisions to be documented in the relevant specifications.

## Agent execution model

The platform provides the infrastructure and reusable primitives required to execute agents. Users remain responsible for defining their intended use cases and configuring their integrations.

### Platform responsibilities

- Provide agent creation, configuration, and lifecycle management.
- Orchestrate agent execution through AWS Strands Agents.
- Execute user agents in isolated Docker containers.
- Provide supported tools and connector interfaces.
- Manage task scheduling, execution status, retries, and failure reporting.
- Enforce authorization, execution limits, and security policies.
- Monitor executions and record relevant audit events.

### User responsibilities

- Define the agent's purpose and configuration.
- Supply configuration for external integrations.
- Provide the credentials and permissions required to access their external services.
- Configure user-provided MCP servers and database connections.
- Ensure their use of connected services is authorized.

Users must never be required to embed secrets directly in agent instructions or source code. The platform must provide an appropriate mechanism for securely storing and injecting credentials at execution time.

## Tool and connector primitives

The platform will provide standardized interfaces through which agents can interact with external systems.

### Initial primitives

- **HTTP:** GET, POST, and additional methods as required.
- **MCP:** Connect to user-provided MCP servers and expose their permitted tools to agents.
- **Databases:** Connect to supported databases using user-provided connection configuration and credentials.
- **Extensible tools:** Add further integrations without rewriting the core execution engine.

### Connector requirements

- Validate tool inputs against explicit schemas.
- Apply authentication and authorization before accessing protected resources.
- Keep credentials separate from agent instructions and ordinary logs.
- Apply timeouts, resource limits, and appropriate error handling.
- Restrict network access to mitigate SSRF and unauthorized access.
- Enforce least privilege for database and MCP connections.
- Make tool execution observable and auditable.

A connector must not automatically grant an agent access to every resource available to its credentials. Permissions should be scoped to the intended integration and use case wherever possible.

## Security and isolation

Agent execution is a security boundary, not merely a background process.

- Run user agents in isolated Docker execution environments.
- Separate agent execution from the API and other trusted platform services.
- Apply CPU, memory, runtime, and concurrency limits.
- Restrict container privileges, filesystem access, and network connectivity.
- Avoid mounting host credentials, Docker sockets, or sensitive host directories into agent containers.
- Securely inject only the credentials required for a particular execution.
- Prevent cross-user access to configurations, tasks, logs, and execution results.
- Monitor suspicious tool usage and enforce platform policies independently of agent reasoning.

Docker containers are one layer of defense and must not be treated as a complete security boundary by themselves. The production isolation model must be validated against the expected threat model.

## Repository structure

```text
.
├── AGENTS.md
├── README.md
├── spec/
│   ├── 2026-10-10-user-authentication/
│   │   ├── task.md
│   │   ├── plan.md
│   │   └── implementation.md
│   ├── 2026-10-12-agent-management/
│   │   ├── task.md
│   │   ├── plan.md
│   │   └── implementation.md
│   └── 2026-10-15-isolated-execution/
│       ├── task.md
│       ├── plan.md
│       └── implementation.md
├── frontend/
├── backend/
├── tests/
└── ...
```

The tree illustrates the intended organization; dates and feature folders are examples.

### Feature specification history

Every feature or substantial change must have a dedicated directory under `spec/`, named using:

`/spec/<YYYY-MM-DD>-<feature-branch-name>/`

For example:

`/spec/2026-10-10-agent-management/`

Each feature directory contains three documents:

- **`task.md`** — The problem, goals, requirements, constraints, and acceptance criteria.
- **`plan.md`** — The proposed design, affected components, implementation steps, and validation strategy.
- **`implementation.md`** — What was implemented, important decisions, test results, deviations from the plan, and known limitations.

These documents form the feature's version-controlled history alongside Git.

**Rules:**

1. Create the feature specification directory before beginning substantial implementation.
2. Keep each feature's documents associated with its corresponding Git branch and changes.
3. Update the plan when the implementation approach materially changes.
4. Update the implementation record as work progresses and when the feature is completed.
5. Preserve completed feature directories as historical records rather than reusing them for unrelated work.
6. For changes to an existing feature, create a new dated feature directory when a distinct, reviewable change warrants its own history.
7. Do not copy the entire constitution into each feature specification; reference `AGENTS.md` instead.

Git remains the authoritative source for code history. The `spec/` directory preserves the reasoning, requirements, and implementation record associated with that history.

## Development

### Prerequisites

Install the appropriate versions of:

- Python
- Node.js and the project's package manager
- PostgreSQL
- Docker
- Git

Exact versions and setup commands should be documented as the development environment is established.

### Getting started

1. Clone the repository.
2. Review `AGENTS.md` and the relevant feature specifications.
3. Install frontend and backend dependencies.
4. Configure environment variables using the project's example configuration.
5. Start the required local services, including PostgreSQL.
6. Run database migrations.
7. Start the API and frontend development servers.
8. Run the relevant tests before submitting changes.

Do not commit real credentials or production configuration files.

Detailed commands will be added once the repository structure, dependency managers, and local infrastructure are finalized.

## Development workflow

1. Define the feature in `spec/<date>-<feature-branch-name>/task.md`.
2. Design the implementation in `plan.md`.
3. Implement against the acceptance criteria.
4. Record material implementation decisions and test results in `implementation.md`.
5. Run the appropriate automated checks.
6. Review the diff for security, correctness, scope, and maintainability.
7. Obtain the required human review before shipping.

See `AGENTS.md` for the project's constitution, implementation rules, quality requirements, and shipping criteria.

## Project status

The project is in its initial development phase. The immediate priority is a working MVP that supports user authentication, agent configuration, tool execution, isolated asynchronous execution, and execution monitoring.

Architecture details and technology choices that have not yet been validated should be treated as provisional rather than completed capabilities.

## License

To be determined.
