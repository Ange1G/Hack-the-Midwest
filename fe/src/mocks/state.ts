import type {
	Agent,
	AgentConfigurations,
	AgentInput,
	Finding,
	HttpContract,
	HttpOptions,
	Run,
	RunEvent,
} from "#/lib/api/schemas";
import {
	CONTRACT_VERSION,
	SECRET_PLACEHOLDER,
	untrustedDestinationReason,
} from "#/lib/http-contract";

// In-memory state behind the mock API. Development and test only. Identity is
// whatever the X-Dev-User-SSO header says, exactly like the backend's
// development auth, so there is no user table.

export type MockState = {
	agents: Agent[];
	runs: Run[];
	events: RunEvent[];
	findings: Finding[];
	ticks: Map<string, number>;
	counter: number;
};

function createState(): MockState {
	return {
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

const uniqueSorted = (values: number[]) =>
	Array.from(new Set(values)).sort((a, b) => a - b);

function compactOptions(options: HttpOptions | undefined): HttpOptions | null {
	if (!options) return null;
	const compact: HttpOptions = {};
	if (options.retries != null) compact.retries = options.retries;
	if (options.timeout != null) compact.timeout = options.timeout;
	return Object.keys(compact).length > 0 ? compact : null;
}

// Stores a contract the way the backend does: credentials replaced by the
// placeholder (the real server encrypts them into a separate table) and unset
// fields omitted.
function storedContract(
	contract: AgentInput["configurations"]["primitives"][string],
): HttpContract {
	const options = compactOptions(contract.options);
	return {
		contractVersion: CONTRACT_VERSION,
		method: contract.method,
		URL: contract.URL,
		...(contract.payload !== undefined ? { payload: contract.payload } : {}),
		...(contract.xApiKey ? { xApiKey: SECRET_PLACEHOLDER } : {}),
		...(contract.authorizationHeader
			? { authorizationHeader: SECRET_PLACEHOLDER }
			: {}),
		...(options ? { options } : {}),
	};
}

export function createAgent(owner_user_sso: string, input: AgentInput): Agent {
	const primitives: Record<string, HttpContract> = {};
	for (const [name, contract] of Object.entries(
		input.configurations.primitives,
	)) {
		primitives[name] = storedContract(contract);
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

// Drives a run through its whole lifecycle synchronously, for seeding and tests.
export function runToCompletion(run: Run): void {
	while (run.status === "queued" || run.status === "running") {
		advanceRun(run);
	}
}

function finish(run: Run, agent: Agent, output: string): void {
	run.status = "succeeded";
	run.output = output;
	run.finished_at = now();
	pushEvent(run, "log", "Run finished");
	syncLastRun(agent, run);
}

function kill(run: Run, agent: Agent, rule: string, message: string): void {
	const finding: Finding = {
		id: nextId("fnd"),
		run_id: run.id,
		agent_id: agent.id,
		severity: "critical",
		rule,
		message,
		action: "killed",
		created_at: now(),
	};
	mockState.findings.push(finding);
	pushEvent(run, "security", message, { rule, finding_id: finding.id });
	run.status = "killed";
	run.error = "Terminated by the security monitor";
	run.finding_id = finding.id;
	run.finished_at = now();
	agent.flagged = true;
	syncLastRun(agent, run);
}

// Advances a run one step each time it is read, so a polling client sees
// queued, running, and then a terminal state without any wall-clock timers.
// The monitor rule is deterministic, mirroring the constitution's requirement
// that critical controls do not depend on an LLM's judgement: unsafe URLs are
// already refused at save time, so the run-time check watches where data goes.
export function advanceRun(run: Run): void {
	if (run.status !== "queued" && run.status !== "running") return;
	const agent = mockState.agents.find((item) => item.id === run.agent_id);
	if (!agent) return;

	const tick = (mockState.ticks.get(run.id) ?? 0) + 1;
	mockState.ticks.set(run.id, tick);

	if (run.status === "queued") {
		run.status = "running";
		run.started_at = now();
		pushEvent(run, "log", `Agent "${agent.title}" started`);
		pushEvent(run, "log", "Reading instructions and selecting HTTP calls");
		syncLastRun(agent, run);
		return;
	}

	const calls = Object.entries(agent.configurations.primitives);
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
		const [name, contract] = first;
		pushEvent(run, "tool_call", `${contract.method} ${contract.URL}`, {
			primitive: name,
			method: contract.method,
		});
		const reason = untrustedDestinationReason(contract.URL);
		if (reason) {
			kill(run, agent, "exfiltration.untrusted_destination", reason);
			return;
		}
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
