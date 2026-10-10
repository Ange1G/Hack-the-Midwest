import type {
	Agent,
	AgentInput,
	Finding,
	Run,
	RunEvent,
	ToolConfig,
	ToolDefinition,
	User,
} from "#/lib/api/schemas";

// In-memory state behind the mock API. Development and test only.

export type MockUser = User & { password: string };
export type MockAgent = Agent & { owner_id: string };

export type MockState = {
	session: User | null;
	users: MockUser[];
	agents: MockAgent[];
	runs: Run[];
	events: RunEvent[];
	findings: Finding[];
	ticks: Map<string, number>;
	counter: number;
};

function createState(): MockState {
	return {
		session: null,
		users: [],
		agents: [],
		runs: [],
		events: [],
		findings: [],
		ticks: new Map(),
		counter: 0,
	};
}

export const mockState: MockState = createState();

export function resetMockState(): void {
	Object.assign(mockState, createState());
}

export function nextId(prefix: string): string {
	mockState.counter += 1;
	return `${prefix}_${mockState.counter}`;
}

export function now(): string {
	return new Date().toISOString();
}

export function publicUser(user: MockUser): User {
	return { id: user.id, email: user.email, created_at: user.created_at };
}

export function publicAgent(agent: MockAgent): Agent {
	const { owner_id: _ownerId, ...rest } = agent;
	return rest;
}

export function createUser(email: string, password: string): MockUser {
	const user: MockUser = {
		id: nextId("usr"),
		email,
		password,
		created_at: now(),
	};
	mockState.users.push(user);
	return user;
}

export function createAgent(owner: User, input: AgentInput): MockAgent {
	const timestamp = now();
	const agent: MockAgent = {
		id: nextId("agt"),
		owner_id: owner.id,
		name: input.name,
		instructions: input.instructions,
		// Credentials are write-only: accepted on input, never stored on the
		// record the API returns.
		tools: input.tools.map(({ kind, config }) => ({ kind, config })),
		status: "active",
		flagged: false,
		last_run: null,
		created_at: timestamp,
		updated_at: timestamp,
	};
	mockState.agents.push(agent);
	return agent;
}

// Drives a run through its whole lifecycle synchronously, for seeding and tests.
export function runToCompletion(run: Run): void {
	while (run.status === "queued" || run.status === "running") {
		advanceRun(run);
	}
}

export const toolDefinitions: ToolDefinition[] = [
	{
		kind: "http.get",
		name: "HTTP GET",
		description: "Fetch a URL and hand the response body to the agent.",
		config_fields: [{ key: "url", label: "URL", type: "url", required: true }],
		credential_fields: [{ key: "bearer_token", label: "Bearer token" }],
	},
	{
		kind: "http.post",
		name: "HTTP POST",
		description: "Send a JSON body to a URL, for example a webhook.",
		config_fields: [
			{ key: "url", label: "URL", type: "url", required: true },
			{
				key: "body_template",
				label: "Body template (JSON)",
				type: "textarea",
				required: false,
			},
		],
		credential_fields: [{ key: "bearer_token", label: "Bearer token" }],
	},
	{
		kind: "db.query",
		name: "Database query",
		description: "Run a read-only SQL query against your own database.",
		config_fields: [
			{ key: "query", label: "SQL query", type: "textarea", required: true },
		],
		credential_fields: [
			{ key: "connection_string", label: "Connection string" },
		],
	},
	{
		kind: "mcp",
		name: "MCP connector",
		description:
			"Expose the tools of an MCP server you run or subscribe to, such as DevRev.",
		config_fields: [
			{ key: "url", label: "MCP server URL", type: "url", required: true },
		],
		credential_fields: [{ key: "token", label: "Access token" }],
	},
];

export function pushEvent(
	run: Run,
	type: RunEvent["type"],
	message: string,
	data: RunEvent["data"] = null,
): RunEvent {
	const event: RunEvent = {
		id: nextId("evt"),
		run_id: run.id,
		ts: now(),
		type,
		message,
		data,
	};
	mockState.events.push(event);
	return event;
}

function syncLastRun(agent: MockAgent, run: Run): void {
	agent.last_run = {
		id: run.id,
		status: run.status,
		created_at: run.created_at,
	};
	agent.updated_at = now();
}

export function createRun(agent: MockAgent): Run {
	const run: Run = {
		id: nextId("run"),
		agent_id: agent.id,
		status: "queued",
		output: null,
		error: null,
		finding_id: null,
		created_at: now(),
		started_at: null,
		finished_at: null,
	};
	mockState.runs.push(run);
	syncLastRun(agent, run);
	return run;
}

export type Violation = { rule: string; message: string };

const metadataHosts = new Set(["169.254.169.254", "metadata.google.internal"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const privateRanges = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

// Deterministic security rule, mirroring the constitution's requirement that
// critical controls do not depend on an LLM's judgement.
export function findViolation(tool: ToolConfig): Violation | null {
	if (tool.kind !== "http.get" && tool.kind !== "http.post") return null;
	const raw = tool.config.url;
	if (!raw) return null;
	let host: string;
	try {
		host = new URL(raw).hostname;
	} catch {
		return null;
	}
	if (metadataHosts.has(host)) {
		return {
			rule: "ssrf.metadata_endpoint",
			message: `HTTP tool targeted the cloud metadata endpoint (${host}). Request blocked and run terminated.`,
		};
	}
	if (
		loopbackHosts.has(host) ||
		privateRanges.some((range) => range.test(host))
	) {
		return {
			rule: "ssrf.private_network",
			message: `HTTP tool targeted a private network address (${host}). Request blocked and run terminated.`,
		};
	}
	return null;
}

function describeTool(tool: ToolConfig): string {
	switch (tool.kind) {
		case "http.get":
		case "http.post":
		case "mcp":
			return tool.config.url ?? "(no url configured)";
		case "db.query":
			return tool.config.query ?? "(no query configured)";
	}
}

function finish(run: Run, agent: MockAgent, output: string): void {
	run.status = "succeeded";
	run.output = output;
	run.finished_at = now();
	pushEvent(run, "log", "Run finished");
	syncLastRun(agent, run);
}

function kill(run: Run, agent: MockAgent, violation: Violation): void {
	const finding: Finding = {
		id: nextId("fnd"),
		run_id: run.id,
		agent_id: agent.id,
		severity: "critical",
		rule: violation.rule,
		message: violation.message,
		action: "killed",
		created_at: now(),
	};
	mockState.findings.push(finding);
	pushEvent(run, "security", violation.message, {
		rule: violation.rule,
		finding_id: finding.id,
	});
	run.status = "killed";
	run.error = "Terminated by the security monitor";
	run.finding_id = finding.id;
	run.finished_at = now();
	agent.flagged = true;
	syncLastRun(agent, run);
}

// Advances a run one step each time it is read, so a polling client sees
// queued, running, and then a terminal state without any wall-clock timers.
export function advanceRun(run: Run): void {
	if (run.status !== "queued" && run.status !== "running") return;
	const agent = mockState.agents.find((item) => item.id === run.agent_id);
	if (!agent) return;

	const tick = (mockState.ticks.get(run.id) ?? 0) + 1;
	mockState.ticks.set(run.id, tick);

	if (run.status === "queued") {
		run.status = "running";
		run.started_at = now();
		pushEvent(run, "log", `Agent "${agent.name}" started`);
		pushEvent(run, "log", "Reading instructions and selecting tools");
		syncLastRun(agent, run);
		return;
	}

	if (tick === 2) {
		const tool = agent.tools[0];
		if (!tool) {
			finish(run, agent, "No tools configured, so there was nothing to do.");
			return;
		}
		pushEvent(run, "tool_call", `${tool.kind} ${describeTool(tool)}`, {
			tool: tool.kind,
			config: tool.config,
		});
		const violation = findViolation(tool);
		if (violation) {
			kill(run, agent, violation);
			return;
		}
		pushEvent(run, "tool_result", `${tool.kind} returned 200 OK`, {
			status: 200,
			bytes: 1284,
		});
		return;
	}

	finish(
		run,
		agent,
		`Completed ${agent.tools.length} tool call${agent.tools.length === 1 ? "" : "s"}. Summary: all checks passed, nothing needs attention.`,
	);
}
