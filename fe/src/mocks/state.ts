import type {
	Agent,
	AgentConfigurations,
	AgentInput,
	Connector,
	ConnectorCreate,
	Finding,
	HttpContract,
	HttpOptions,
	Run,
	RunEvent,
} from "#/lib/api/schemas";
import {
	connectorCreateFromHttpCall,
	httpContractFromConnector,
} from "#/lib/api/schemas";
import {
	CONTRACT_VERSION,
	SECRET_PLACEHOLDER,
	untrustedDestinationReason,
} from "#/lib/http-contract";

export type MockState = {
	agents: Agent[];
	connectors: Connector[];
	runs: Run[];
	events: RunEvent[];
	findings: Finding[];
	ticks: Map<string, number>;
	counter: number;
};

function createState(): MockState {
	return {
		agents: [],
		connectors: [],
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

const uniqueSorted = (values: number[]) =>
	Array.from(new Set(values)).sort((a, b) => a - b);

function compactOptions(options: HttpOptions | undefined): HttpOptions | null {
	if (!options) return null;
	const compact: HttpOptions = {};
	if (options.retries != null) compact.retries = options.retries;
	if (options.timeout != null) compact.timeout = options.timeout;
	return Object.keys(compact).length > 0 ? compact : null;
}

function storedHttpContract(body: ConnectorCreate): Connector["contract"] {
	const credentials: Record<string, string> = {};
	if (body.credentials?.xApiKey) credentials.xApiKey = SECRET_PLACEHOLDER;
	if (body.credentials?.authorizationHeader) {
		credentials.authorizationHeader = SECRET_PLACEHOLDER;
	}
	const options = compactOptions(body.options ?? undefined);
	return {
		type: "http",
		contractVersion: CONTRACT_VERSION,
		name: body.name,
		config: {
			method: body.config.method,
			URL: body.config.URL,
			...(body.config.payload !== undefined
				? { payload: body.config.payload }
				: {}),
		},
		...(Object.keys(credentials).length > 0 ? { credentials } : {}),
		...(options ? { options } : {}),
	};
}

export function createConnector(
	owner_user_sso: string,
	body: ConnectorCreate,
): Connector {
	if (mockState.connectors.some((item) => item.owner_user_sso === owner_user_sso && item.name === body.name)) {
		const error = new Error("connector_name_taken") as Error & {
			code: string;
		};
		error.code = "connector_name_taken";
		throw error;
	}
	const timestamp = now();
	const connector: Connector = {
		id: nextId("con"),
		owner_user_sso,
		type: body.type,
		name: body.name,
		contract: storedHttpContract(body),
		created_at: timestamp,
		updated_at: timestamp,
	};
	mockState.connectors.push(connector);
	return connector;
}

export function createAgent(owner_user_sso: string, input: AgentInput): Agent {
	const primitives: AgentConfigurations["primitives"] = {};
	for (const [name, contract] of Object.entries(
		input.configurations.primitives,
	)) {
		const connector = createConnector(
			owner_user_sso,
			connectorCreateFromHttpCall(name, contract),
		);
		primitives[connector.id] = {};
	}
	const configurations: AgentConfigurations = {
		primitives,
		...(input.configurations.month != null
			? { month: input.configurations.month }
			: {}),
		dayOfWeek: uniqueSorted(input.configurations.dayOfWeek),
		timeOfDay: uniqueSorted(input.configurations.timeOfDay),
	};
	const timestamp = now();
	const agent: Agent = {
		id: nextId("agt"),
		title: input.agentTitle,
		system_prompt: input.systemPrompt,
		configurations,
		schedule_month: null,
		schedule_day: null,
		schedule_time: null,
		owner_user_sso,
		created_at: timestamp,
		updated_at: timestamp,
		flagged: false,
		last_run: null,
	};
	mockState.agents.push(agent);
	return agent;
}

export function httpCallsForAgent(
	agent: Agent,
): Array<{ id: string; name: string; contract: HttpContract }> {
	const calls: Array<{ id: string; name: string; contract: HttpContract }> = [];
	for (const id of Object.keys(agent.configurations.primitives)) {
		const connector = mockState.connectors.find(
			(item) => item.id === id && item.owner_user_sso === agent.owner_user_sso,
		);
		if (!connector) continue;
		const contract = httpContractFromConnector(connector);
		if (!contract) continue;
		calls.push({ id, name: connector.name, contract });
	}
	return calls;
}

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

function syncLastRun(agent: Agent, run: Run): void {
	agent.last_run = {
		id: run.id,
		status: run.status,
		created_at: run.created_at,
	};
	agent.updated_at = now();
}

export function createRun(agent: Agent): Run {
	const timestamp = now();
	const run: Run = {
		id: nextId("run"),
		agent_id: agent.id,
		owner_user_sso: agent.owner_user_sso,
		status: "queued",
		result: null,
		error_code: null,
		error_message: null,
		runner_meta: null,
		created_at: timestamp,
		updated_at: timestamp,
		started_at: null,
		finished_at: null,
	};
	mockState.runs.push(run);
	syncLastRun(agent, run);
	return run;
}

export function runToCompletion(run: Run): void {
	while (run.status === "queued" || run.status === "running") {
		advanceRun(run);
	}
}

function finish(run: Run, agent: Agent, output: string): void {
	run.status = "succeeded";
	run.result = { output, model: "mock" };
	run.finished_at = now();
	run.updated_at = run.finished_at;
	pushEvent(run, "log", "Run finished");
	syncLastRun(agent, run);
}

function failRun(run: Run, agent: Agent, message: string): void {
	const finding: Finding = {
		id: nextId("fnd"),
		run_id: run.id,
		agent_id: agent.id,
		severity: "critical",
		rule: "exfiltration.untrusted_destination",
		message,
		action: "killed",
		created_at: now(),
	};
	mockState.findings.push(finding);
	pushEvent(run, "security", message, { rule: finding.rule, finding_id: finding.id });
	run.status = "failed";
	run.error_code = "policy_violation";
	run.error_message = `Terminated by the security monitor: ${message}`;
	run.finished_at = now();
	run.updated_at = run.finished_at;
	agent.flagged = true;
	syncLastRun(agent, run);
}

export function advanceRun(run: Run): void {
	if (run.status !== "queued" && run.status !== "running") return;
	const agent = mockState.agents.find((item) => item.id === run.agent_id);
	if (!agent) return;

	const tick = (mockState.ticks.get(run.id) ?? 0) + 1;
	mockState.ticks.set(run.id, tick);

	if (run.status === "queued") {
		run.status = "running";
		run.started_at = now();
		run.updated_at = run.started_at;
		pushEvent(run, "log", `Agent "${agent.title}" started`);
		pushEvent(run, "log", "Reading instructions and selecting HTTP calls");
		syncLastRun(agent, run);
		return;
	}

	const calls = httpCallsForAgent(agent);
	if (tick === 2) {
		const first = calls[0];
		if (!first) {
			finish(
				run,
				agent,
				"No HTTP calls configured, so there was nothing to do.",
			);
			return;
		}
		const { name, contract } = first;
		pushEvent(run, "tool_call", `${contract.method} ${contract.URL}`, {
			primitive: name,
			method: contract.method,
		});
		const reason = untrustedDestinationReason(contract.URL);
		if (reason) {
			failRun(run, agent, reason);
			return;
		}
		run.result = {
			output: null,
			tool_calls: [
				{ name, method: contract.method, URL: contract.URL, status: 200 },
			],
		};
		pushEvent(run, "tool_result", `${name} returned 200 OK`, {
			status: 200,
			bytes: 1284,
		});
		return;
	}

	finish(
		run,
		agent,
		`Completed ${calls.length} HTTP call${calls.length === 1 ? "" : "s"}. Summary: all checks passed, nothing needs attention.`,
	);
}