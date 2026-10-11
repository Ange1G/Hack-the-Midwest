# Constitution

## Required reading

- **Platform overview and architecture:** [README.md](README.md) at the repository root.
- **Requirements, SDLC, and quality:** this file ([AGENTS.md](AGENTS.md)).
- **Feature work:** `spec/<YYYY-MM-DD>-<feature-name>/` (`task.md`, `plan.md`, `implementation.md`) before substantial implementation.

Do **not** treat [api/README.md](api/README.md) or [fe/README.md](fe/README.md) as platform requirements—they are subsystem runbooks (setup, migrate, local commands). If nested agent instructions conflict with this file, **root AGENTS.md wins**.

## Requirements

- **User accounts and isolation**
  - Users must be able to create accounts, authenticate, and manage their configurations.
  - Users must only access their own resources unless explicitly authorized otherwise.
  - All user-owned resources must be associated with an owner or tenant.
  - Authentication and authorization must be enforced by the backend, never solely by the frontend.

- **User-configurable agents**
  - Users must be able to create, configure, manage, execute, and monitor their own agents.
  - Agent configurations must support different use cases without requiring custom application code for each agent.
  - The platform must provide reusable primitives, including:
    - HTTP.GET and HTTP.POST
    - MCP client connectors and tools
    - Database connectors
    - Additional tools and integrations as needed
  - Agents must operate within explicit permissions and resource constraints.
  - Agent configurations, tool permissions, execution history, and status must be persisted.
  - Secrets and credentials must be stored securely and must never be exposed in logs, client responses, or agent-visible configuration unnecessarily.

- **Distributed task queue**
  - Long-running agent executions must run asynchronously outside the API request lifecycle.
  - The system must support task submission, scheduling where needed, status tracking, retries, timeouts, and failure reporting.
  - Workers must be independently scalable from the API.
  - Task execution must account for duplicate delivery, worker crashes, and interrupted executions.
  - Task state and execution results must be persisted.

- **Agent monitoring and security**
  - The platform must support monitoring long-running agents and their executions.
  - Separate monitoring jobs or agents must evaluate user agents for malware-related behavior, suspicious activity, policy violations, and prohibited actions.
  - Monitoring must produce auditable findings and actionable execution states.
  - Security enforcement must not rely exclusively on an LLM's judgment.
  - Critical security controls must be enforced deterministically where possible.

## Project

Build a secure, extensible, multi-user platform for creating, configuring, and executing user-defined agents.

The platform provides a collection of reusable tools, integrations, execution infrastructure, and security controls so users can build agents for their own workflows without implementing the underlying infrastructure themselves.

### Core capabilities

1. User authentication and resource isolation.
2. Agent creation and configuration.
3. Reusable tool and connector primitives.
4. Asynchronous, distributed agent execution.
5. Execution history, status, and observability.
6. Background monitoring and security enforcement.
7. Extensible architecture for adding tools, integrations, and agent capabilities.

### MVP scope

Prioritize a complete, working vertical slice over a broad collection of unfinished features.

The initial MVP should allow a user to:

1. Create an account and authenticate.
2. Create and configure an agent.
3. Select from a small set of supported tools.
4. Execute the agent through the distributed task system.
5. View execution status, output, and errors.
6. Inspect execution history.
7. Have agent executions subject to basic security controls.

Defer nonessential integrations, advanced orchestration, complex scheduling, and UI polish until the core workflow works reliably.

## Roadmap

- [x] Scaffold project.
- [x] Build the MVP API before polishing.
- [x] Build the MVP backend and execution infrastructure before polishing.
- [x] Implement agent creation and configuration persistence.
- [x] Implement the first tool primitives: HTTP.GET and HTTP.POST.
- [x] Implement asynchronous task submission and worker execution.
- [x] Implement task status, results, error handling, and execution history.
- [x] Implement baseline execution limits and security controls.
- [x] Build the MVP frontend before polishing (dashboard on `fe/`; wired to executions and connectors API).
  - [x] Base layout: sign-in, agents list, agent detail, run view.
  - [x] Create agent with HTTP primitives (UI creates connectors, then agent with UUID references).
  - [x] Start execution and poll `/executions` for status, `result.output`, and errors.
  - [x] Connector library (HTTP/MCP/database), library-first agent create/edit, webhook agent|chain targets.
  - [ ] Production auth and security findings UI (stub only).
- [ ] Implement authentication and user-level resource isolation.
- [ ] Implement background monitoring and policy-violation reporting.
- [ ] Add end-to-end tests for the primary user workflow.
- [ ] Validate reliability, security, and deployment procedures.
- [ ] Polish the UI and improve developer experience.
- [ ] Expand connectors, scheduling, observability, and agent capabilities.

Roadmap items describe intended outcomes, not permission to bypass quality requirements. Update the roadmap as priorities and implementation details change.

## Principles

### 1. Correctness before complexity

Prefer the simplest implementation that satisfies the requirements without compromising security, reliability, or extensibility.

Do not introduce abstractions, services, frameworks, or infrastructure without a concrete need.

### 2. Security by default

Treat user-defined agent instructions, tool inputs, external responses, database contents, and retrieved documents as untrusted input.

Enforce authorization, input validation, least privilege, execution limits, and tenant isolation at appropriate trust boundaries.

### 3. Explicit boundaries

Separate API concerns, business logic, persistence, task execution, and external integrations.

Each module must have a clear responsibility and a defined interface.

### 4. Extensibility through composition

Agent capabilities should be assembled from reusable tools and connectors with explicit contracts.

Adding a new tool should not require rewriting the agent execution system.

### 5. Asynchronous execution

API handlers must not synchronously perform unbounded agent executions.

Long-running work belongs in the task execution system, with durable status tracking and appropriate timeouts.

### 6. Observable behavior

Important operations must produce structured logs and sufficient execution metadata to diagnose failures.

Never log secrets, access tokens, passwords, or unnecessarily sensitive user data.

### 7. Testable design

Business logic must be testable independently of HTTP handlers, databases, external APIs, and LLM providers wherever practical.

External dependencies should be replaceable with test doubles.

### 8. Minimal dependencies

Prefer established libraries and existing project utilities over unnecessary dependencies.

New dependencies must provide a clear benefit and be compatible with the project's security and maintenance requirements.

### 9. No speculative implementation

Do not implement hypothetical future requirements, premature abstractions, or unused infrastructure.

Design for known extension points without building features that are not needed.

### 10. Maintainability over shortcuts

Do not sacrifice correctness, security, readability, or architectural consistency for a faster initial implementation.

Temporary workarounds must be explicitly documented, justified, and tracked for removal.

## Tech Stack

### Frontend

- React
- TypeScript
- TanStack libraries as appropriate to the application architecture
- shadcn/ui
- Vitest for unit and integration testing
- Playwright for end-to-end testing

Use strict TypeScript settings. Avoid `any` unless justified and narrowly scoped.

### Backend

- Python
- FastAPI
- Pydantic for request validation, response schemas, and configuration models
- SQLAlchemy for relational persistence
- Alembic for database schema migrations
- pytest for unit and integration testing

Keep API handlers thin. Place business rules in application or domain services rather than embedding them in route handlers.
Favor Python static typing & industry standard REST API rules and conventions.

### Database

- PostgreSQL

Use explicit schemas, constraints, indexes, and transactions where appropriate.

Database schema changes must be managed through migrations. Never rely on automatic production schema creation or destructive schema changes without an explicit migration strategy.

### Distributed execution

Use a durable task queue and independently running workers.

The MVP execution queue uses PostgreSQL `SELECT … FOR UPDATE SKIP LOCKED`. This is sufficient for single-worker development and early validation but must be replaced with a durable message broker (e.g. Redis + Celery, or a managed queue) before running multiple workers in production. The broker technology must be selected and documented before scaling execution infrastructure. Do not assume the PostgreSQL queue is sufficient for concurrent or fault-tolerant production workloads.

### Infrastructure and tooling

- Git for version control.
- Environment-based configuration.
- Automated checks in CI.
- Containerization where appropriate for consistent development and deployment.

Exact deployment infrastructure, broker technology, authentication provider, and LLM provider remain implementation decisions until explicitly selected.

## Architecture Constraints

### Agent orchestration

- AWS Strands Agents is the designated agent framework.
- Keep agent orchestration separate from HTTP request handling, persistence, and worker infrastructure.
- Agent configurations and tool permissions must be explicit and persistable.
- Do not couple domain logic to a specific LLM provider unless required by the applicable specification.

### Hosting and isolated execution

- Akamai Cloud is the designated hosting platform.
- User agents must execute in isolated Docker containers.
- The API, trusted platform services, and user-controlled agent execution must have clearly defined trust boundaries.
- Container execution must use least privilege, resource limits, controlled network access, and explicit credential injection.
- Do not expose the Docker daemon or host-level privileges to user agents.
- Document and validate the production container isolation strategy before exposing untrusted users to agent execution.

### User-provided integrations

- The platform provides reusable HTTP tools, MCP client connectors, database connectors, and additional tool primitives.
- Users provide their own integration configuration, connection details, and required credentials.
- MCP support must allow users to connect their own MCP servers, subject to platform compatibility and security restrictions.
- Credentials must be stored and handled separately from agent instructions and ordinary configuration data.
- Never assume that a connected server, database, tool, or endpoint is trustworthy simply because a user configured it.
- Every connector must enforce appropriate timeouts, permissions, input validation, and security boundaries.

### Feature specification history

- Every substantial feature must have a version-controlled directory under `/spec`.
- Directory naming convention: `YYYY-MM-DD-<feature-branch-name>`.
- Each feature directory must contain `task.md`, `plan.md`, and `implementation.md`.
- Git preserves code history; feature specifications preserve requirements, plans, decisions, and implementation records.
- Do not overwrite historical feature specifications with unrelated work.

## Software Development Life Cycle

All meaningful changes must follow a requirements-driven workflow.

### 1. Specification

Before implementation:

1. Identify the problem and intended outcome.
2. Define observable acceptance criteria.
3. Identify affected components, interfaces, and data models.
4. Identify security, failure, and compatibility considerations.
5. Identify required tests.

Use a feature-specific specification when the change is substantial. Do not duplicate the entire project constitution in individual specifications.

### 2. Planning

For nontrivial changes:

1. Inspect the existing implementation and relevant specifications.
2. Identify dependencies and architectural constraints.
3. Break the work into small, verifiable tasks.
4. Define the expected changes and validation strategy.
5. Record unresolved decisions rather than silently inventing requirements.

Do not create elaborate plans for trivial changes.

### 3. Implementation

Implement the smallest complete change that satisfies the specification.

Follow established project conventions and keep changes within the intended scope.

Do not silently change public interfaces, database contracts, or unrelated behavior.

### 4. Review

Review every meaningful change for:

- Functional correctness.
- Security and authorization.
- Error handling and failure behavior.
- Concurrency and race conditions.
- Performance and resource usage.
- Architectural consistency.
- Test coverage.
- Unnecessary complexity and technical debt.

Automated agent reviews are supplementary. Human review remains required for security-sensitive changes, architectural decisions, and other changes designated by the project owner.

### 5. Validation

Run the relevant automated checks and inspect their actual results.

Verify that acceptance criteria are satisfied, tests pass, migrations are valid, and the implementation introduces no known regressions.

Never claim a test, build, review, or deployment succeeded unless its result has been observed.

### 6. Shipping

A change is ready to ship only when:

- Its acceptance criteria are satisfied.
- Relevant tests and quality checks pass.
- Security and authorization requirements are met.
- Errors and expected failure modes are handled.
- Documentation is updated where necessary.
- No known critical defects or unjustified technical debt remain.
- Required human approvals have been obtained.

If a requirement cannot be met, explicitly report the limitation. Do not conceal incomplete work behind passing tests.

## Quality Control

### Frontend

- Vitest for unit and integration tests.
- React Testing Library for component behavior where appropriate.
- Playwright for end-to-end tests.
- TypeScript type checking.
- Linting and formatting checks.

Test observable behavior rather than implementation details.

### Backend

- pytest for unit and integration tests.
- FastAPI test clients for HTTP-level behavior.
- Database integration tests against an appropriate PostgreSQL test environment.
- Explicit tests for authentication, authorization, and cross-user resource isolation.
- Tests for validation failures, exceptions, timeouts, and other expected failure modes.

### General

- Test critical business rules and security boundaries.
- Avoid tests that merely reproduce the implementation.
- Prefer deterministic tests with controlled external dependencies.
- Never weaken or delete a test solely to make a change pass.
- Fix the underlying defect when a test exposes incorrect behavior.
- Add regression tests for meaningful bug fixes.

## Testing

### Test-driven development

Follow red-green-refactor for testable behavior:

1. **Red:** Write a test that captures the intended behavior and fails for the expected reason.
2. **Green:** Implement the minimum code necessary to pass.
3. **Refactor:** Improve the implementation while preserving passing tests.

For changes where strict TDD is impractical, document the reason and still add appropriate tests.

### Required test coverage

Prioritize:

- Business logic and domain invariants.
- API request and response contracts.
- Authentication and authorization.
- Tenant isolation.
- Database constraints and transactional behavior.
- Task lifecycle transitions.
- Retry, timeout, and duplicate-execution behavior.
- Tool permission enforcement.
- Security policy enforcement.
- Critical user workflows.

Do not optimize for an arbitrary coverage percentage at the expense of meaningful assertions.

## Implementation

### General

- Read the relevant code and specifications before editing.
- Reuse existing patterns when they are sound and consistent.
- Keep functions, classes, and modules focused on a clear responsibility.
- Prefer explicit contracts and predictable control flow.
- Validate external inputs at system boundaries.
- Handle errors intentionally; never silently swallow unexpected exceptions.
- Avoid duplicated business logic.
- Avoid unnecessary comments that merely restate the code.
- Add comments when explaining non-obvious decisions, constraints, or trade-offs.
- Do not introduce dead code, unused dependencies, placeholder implementations, or unexplained magic values.
- Do not refactor unrelated components unless required for correctness or explicitly approved.

### Frontend

- Keep UI components focused and composable.
- Separate reusable presentation components from application-specific workflows.
- Use TypeScript types for API contracts and component interfaces.
- Represent loading, empty, success, and error states explicitly.
- Treat client-side validation as a usability feature, not a security boundary.
- Keep authentication tokens and secrets out of browser logs and unsafe persistent storage.
- Avoid unnecessary global state; use local state or established state-management patterns where appropriate.
- Use accessible controls, semantic markup, and keyboard-friendly interactions.
- Keep server state, client state, and form state conceptually distinct.
- Read the API in the repository to verify and manage frontend features effectively.

### Backend

- Keep FastAPI route handlers focused on HTTP concerns.
- Use Pydantic schemas to validate external input and define API contracts.
- Separate business logic from transport and persistence concerns.
- Use SQLAlchemy sessions and transactions with explicit lifecycle management.
- Use dependency injection for shared infrastructure and testable boundaries.
- Enforce authentication and resource-level authorization on every relevant operation.
- Use structured errors and appropriate HTTP status codes.
- Apply pagination and bounded queries to collection endpoints.
- Use explicit timeouts for external HTTP calls and other potentially unbounded operations.
- Make transaction boundaries and concurrency assumptions clear.
- Keep background work outside request handlers when it can outlive the request.

### Agent execution and task processing

- Treat agent configurations as untrusted, user-controlled input.
- Validate tool arguments against explicit schemas.
- Enforce tool allowlists, permissions, execution timeouts, and resource budgets.
- Prevent arbitrary code execution unless it is explicitly designed, isolated, and authorized.
- Protect against SSRF, credential exposure, prompt injection, and unauthorized data access.
- Do not allow user-defined agents to bypass platform authorization through connectors or tools.
- Assume queued tasks may be delivered more than once.
- Use idempotency or deduplication where duplicate execution could cause harm.
- Persist meaningful task state transitions and execution outcomes.
- Distinguish retryable failures from permanent failures.
- Bound retries and implement appropriate backoff.
- Make cancellation and worker-crash behavior explicit.
- Keep security monitoring independent of the agent's own claims about its behavior.

## Review

### Human-in-the-loop

Human review is required before shipping changes that materially affect:

- Authentication or authorization.
- Tenant isolation or secret handling.
- Agent execution permissions or isolation boundaries.
- Database migrations with data-loss potential.
- Production infrastructure or deployment security.
- Public API contracts or other critical architectural decisions.

### Agent review

Automated reviewers should evaluate changes against this constitution and the applicable feature specification.

Reviewers should identify concrete defects, missing tests, security vulnerabilities, violated requirements, and unnecessary complexity.

Review findings must distinguish confirmed defects from speculative concerns. Do not treat an agent review as proof that a change is correct or secure.

## Shipping

Before shipping:

1. Confirm the original request and acceptance criteria are satisfied.
2. Run relevant tests, type checks, linting, and build checks.
3. Inspect the final diff for unintended changes.
4. Review security-sensitive code and data-access boundaries.
5. Verify database migrations and configuration changes.
6. Update affected documentation and specifications.
7. Confirm no known critical defects or unjustified technical debt remain.
8. Obtain required human approval.

Report what changed, what was tested, any known limitations, and any remaining follow-up work.

Never claim production deployment unless deployment was actually performed and verified.

## Rules

1. **Specifications are authoritative.** Implement against the applicable requirements and acceptance criteria. If they conflict with this constitution, stop and resolve the conflict rather than silently choosing one.

2. **Do not invent requirements.** Ask for clarification when an unresolved decision materially affects correctness, security, scope, or architecture. Otherwise, choose the simplest reasonable option and document the assumption when necessary.

3. **Inspect before modifying.** Read relevant files, existing abstractions, tests, and configuration before making changes.

4. **Preserve scope.** Do not modify unrelated files or introduce unrelated features without justification.

5. **No fake implementations.** Do not leave TODOs, mock behavior, hardcoded production data, or placeholder success responses in a feature presented as complete.

6. **No silent failures.** Handle errors explicitly and make failures observable.

7. **No bypassing quality gates.** Do not skip, disable, weaken, or remove relevant tests, security checks, or lint rules simply to get a passing result.

8. **No secrets in source control.** Never commit credentials, tokens, private keys, or environment-specific secrets. Use appropriate secret management and sanitized example configuration.

9. **No implicit trust between users.** Every user-owned resource access must be authorized server-side. Never rely on a client-supplied user ID as proof of ownership.

10. **No unbounded work.** Agent executions, external requests, task retries, queries, and other resource-consuming operations must have appropriate limits.

11. **No unnecessary dependencies.** Explain the need for a new dependency when its purpose is not self-evident.

12. **No unjustified technical debt.** Prefer complete, maintainable solutions. If a compromise is necessary, document its impact and follow-up requirements.

13. **No false completion claims.** Report tests, reviews, builds, and deployments accurately. Clearly identify anything not verified.

14. **Keep documentation aligned.** Update specifications, API contracts, architectural decisions, and setup instructions when the implementation changes them.

15. **Follow existing conventions.** When the codebase and this document leave room for interpretation, prefer established project conventions unless they conflict with correctness or security.

16. **Keep this constitution stable.** Update it when a lasting project-wide principle or constraint changes, not for every feature-specific implementation detail.
