import type {
	Agent,
	AgentConfigurations,
	AgentInput,
	AgentUpdate,
	Chain,
	ChainCreate,
	ChainRun,
	ChainRunStep,
	Connector,
	ConnectorCreate,
	ExecutionResult,
	Finding,
	HttpContract,
	HttpContractInput,
	HttpOptions,
	Integration,
	IntegrationInstall,
	KnowledgeDocument,
	KnowledgeDocumentCreate,
	MemoryEntry,
	Run,
	RunEvent,
	Webhook,
	WebhookCreate,
} from "#/lib/api/schemas";
import {
	connectorCreateFromHttpCall,
	httpContractFromConnector,
} from "#/lib/api/schemas";

type HttpAgentSeed = {
	agentTitle: string;
	systemPrompt: string;
	configurations: {
		primitives: Record<string, HttpContractInput>;
		month?: number | null;
		dayOfWeek: number[];
		timeOfDay: number[];
	};
};

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
	webhooks: Webhook[];
	webhookSecrets: Map<string, string>;
	chains: Chain[];
	chainRuns: ChainRun[];
	chainRunSteps: Map<string, ChainRunStep[]>;
	ticks: Map<string, number>;
	mcpTools: Map<string, string[]>;
	knowledgeDocuments: KnowledgeDocument[];
	memory: Map<string, MemoryEntry[]>;
	counter: number;
};

function createState(): MockState {
	return {
		knowledgeDocuments: [],
		memory: new Map(),
		agents: [],
		connectors: [],
		runs: [],
		events: [],
		findings: [],
		webhooks: [],
		webhookSecrets: new Map(),
		chains: [],
		chainRuns: [],
		chainRunSteps: new Map(),
		ticks: new Map(),
		mcpTools: new Map(),
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

function storedContract(body: ConnectorCreate): Connector["contract"] {
	if (body.type === "database") {
		const credentials: Record<string, string> = {};
		if (body.credentials?.username) credentials.username = SECRET_PLACEHOLDER;
		if (body.credentials?.password) credentials.password = SECRET_PLACEHOLDER;
		return {
			type: "database",
			contractVersion: CONTRACT_VERSION,
			name: body.name,
			config: body.config,
			...(Object.keys(credentials).length > 0 ? { credentials } : {}),
		};
	}
	if (body.type === "notification") {
		const masked: Record<string, string> = { webhookUrl: SECRET_PLACEHOLDER };
		if (body.credentials.xApiKey) masked.xApiKey = SECRET_PLACEHOLDER;
		if (body.credentials.authorizationHeader) {
			masked.authorizationHeader = SECRET_PLACEHOLDER;
		}
		return {
			type: "notification",
			contractVersion: CONTRACT_VERSION,
			name: body.name,
			config: body.config,
			credentials: masked,
		};
	}
	if (body.type === "knowledge") {
		return {
			type: "knowledge",
			contractVersion: CONTRACT_VERSION,
			name: body.name,
			...(body.description ? { description: body.description } : {}),
			config: { maxResults: body.config.maxResults ?? 5 },
		};
	}
	const credentials: Record<string, string> = {};
	if (body.credentials?.xApiKey) credentials.xApiKey = SECRET_PLACEHOLDER;
	if (body.credentials?.authorizationHeader) {
		credentials.authorizationHeader = SECRET_PLACEHOLDER;
	}
	const options = compactOptions(body.options ?? undefined);
	if (body.type === "mcp") {
		return {
			type: "mcp",
			contractVersion: CONTRACT_VERSION,
			name: body.name,
			config: { URL: body.config.URL, transport: "streamableHttp" },
			...(Object.keys(credentials).length > 0 ? { credentials } : {}),
			...(options ? { options } : {}),
		};
	}
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
			...(body.config.queryParams
				? { queryParams: body.config.queryParams }
				: {}),
			...(body.config.bodyParams ? { bodyParams: body.config.bodyParams } : {}),
		},
		...(Object.keys(credentials).length > 0 ? { credentials } : {}),
		...(options ? { options } : {}),
	};
}

export function createConnector(
	owner_user_sso: string,
	body: ConnectorCreate,
): Connector {
	if (
		mockState.connectors.some(
			(item) =>
				item.owner_user_sso === owner_user_sso && item.name === body.name,
		)
	) {
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
		contract: storedContract(body),
		created_at: timestamp,
		updated_at: timestamp,
	};
	mockState.connectors.push(connector);
	return connector;
}

export function installIntegration(
	owner_user_sso: string,
	integration: Integration,
	body: IntegrationInstall,
): Connector {
	const name = body.name ?? integration.connector_name;
	if (
		mockState.connectors.some(
			(item) => item.owner_user_sso === owner_user_sso && item.name === name,
		)
	) {
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
		type: integration.connector_type,
		name,
		contract: {
			type: integration.connector_type,
			contractVersion: CONTRACT_VERSION,
			name,
			config: { URL: integration.url },
			...(body.apiKey ? { credentials: { xApiKey: SECRET_PLACEHOLDER } } : {}),
		},
		created_at: timestamp,
		updated_at: timestamp,
	};
	mockState.connectors.push(connector);
	if (integration.connector_type === "mcp") {
		mockState.mcpTools.set(connector.id, [...integration.tools]);
	}
	return connector;
}

export function addKnowledgeDocument(
	connector: Connector,
	body: KnowledgeDocumentCreate,
): KnowledgeDocument {
	const document: KnowledgeDocument = {
		id: nextId("doc"),
		connector_id: connector.id,
		title: body.title,
		size_bytes: new TextEncoder().encode(body.body).length,
		excerpt: body.body.slice(0, 240),
		created_at: now(),
	};
	mockState.knowledgeDocuments.push(document);
	return document;
}

function capabilities(
	configurations: AgentInput["configurations"],
): Pick<AgentConfigurations, "memory" | "delegates"> {
	return {
		...(configurations.memory ? { memory: true } : {}),
		...(configurations.delegates?.length
			? { delegates: [...new Set(configurations.delegates)] }
			: {}),
	};
}

export function insertAgent(owner_user_sso: string, input: AgentInput): Agent {
	const configurations: AgentConfigurations = {
		primitives: input.configurations.primitives,
		...(input.configurations.month != null
			? { month: input.configurations.month }
			: {}),
		dayOfWeek: uniqueSorted(input.configurations.dayOfWeek),
		timeOfDay: uniqueSorted(input.configurations.timeOfDay),
		...(input.configurations.outputSchema
			? { outputSchema: input.configurations.outputSchema }
			: {}),
		...capabilities(input.configurations),
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

export function createAgent(
	owner_user_sso: string,
	input: HttpAgentSeed,
): Agent {
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
	return insertAgent(owner_user_sso, {
		agentTitle: input.agentTitle,
		systemPrompt: input.systemPrompt,
		configurations: {
			primitives,
			...(input.configurations.month != null
				? { month: input.configurations.month }
				: {}),
			dayOfWeek: input.configurations.dayOfWeek,
			timeOfDay: input.configurations.timeOfDay,
		},
	});
}

export function updateAgent(agent: Agent, patch: AgentUpdate): Agent {
	if (patch.agentTitle !== undefined) agent.title = patch.agentTitle;
	if (patch.systemPrompt !== undefined)
		agent.system_prompt = patch.systemPrompt;
	if (patch.configurations !== undefined) {
		agent.configurations = {
			primitives: patch.configurations.primitives,
			...(patch.configurations.month != null
				? { month: patch.configurations.month }
				: {}),
			dayOfWeek: uniqueSorted(patch.configurations.dayOfWeek),
			timeOfDay: uniqueSorted(patch.configurations.timeOfDay),
			...(patch.configurations.outputSchema
				? { outputSchema: patch.configurations.outputSchema }
				: {}),
			...capabilities(patch.configurations),
		};
	}
	agent.updated_at = now();
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

export function createRun(agent: Agent, input: string | null = null): Run {
	const timestamp = now();
	const run: Run = {
		id: nextId("run"),
		agent_id: agent.id,
		owner_user_sso: agent.owner_user_sso,
		status: "queued",
		input,
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

// A memory-enabled agent saves one key per run, as the real runner reports it.
function rememberRun(agent: Agent, run: Run): ExecutionResult["memory_writes"] {
	if (!agent.configurations.memory) return null;
	const key = "last_run";
	const entries = (mockState.memory.get(agent.id) ?? []).filter(
		(entry) => entry.key !== key,
	);
	entries.push({ key, value: { run_id: run.id }, updated_at: now() });
	mockState.memory.set(agent.id, entries);
	return { set: [key], deleted: [], dropped: [] };
}

function finish(run: Run, agent: Agent, output: string): void {
	run.status = "succeeded";
	const memoryWrites = rememberRun(agent, run);
	run.result = {
		output,
		model: "mock",
		tool_calls: run.result?.tool_calls ?? [],
		...(memoryWrites ? { memory_writes: memoryWrites } : {}),
	};
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
	pushEvent(run, "security", message, {
		rule: finding.rule,
		finding_id: finding.id,
	});
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
			advanceLinkedChain(run);
			return;
		}
		run.result = {
			output: null,
			tool_calls: [
				{
					name,
					kind: "http",
					ok: true,
					duration_ms: 240,
					method: contract.method,
					URL: contract.URL,
					status: "HTTP 200",
				},
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
	advanceLinkedChain(run);
}

export function createWebhook(
	owner_user_sso: string,
	target: string | WebhookCreate,
): Webhook {
	const body =
		typeof target === "string"
			? { target_type: "agent" as const, target_agent_id: target }
			: target;
	const target_type = body.target_type ?? "agent";
	const secret = `whsec_${nextId("secret")}`;
	const webhook: Webhook = {
		id: nextId("wh"),
		owner_user_sso,
		target_type,
		target_agent_id:
			target_type === "agent" ? (body.target_agent_id ?? null) : null,
		target_chain_id:
			target_type === "chain" ? (body.target_chain_id ?? null) : null,
		secret,
		disabled: false,
		created_at: now(),
	};
	mockState.webhooks.push(webhook);
	mockState.webhookSecrets.set(webhook.id, secret);
	return webhook;
}

export function maskedWebhook(webhook: Webhook): Webhook {
	return { ...webhook, secret: SECRET_PLACEHOLDER };
}

export function createChain(owner_user_sso: string, body: ChainCreate): Chain {
	const timestamp = now();
	const chain: Chain = {
		id: nextId("chn"),
		owner_user_sso,
		title: body.title,
		schedule: body.schedule ?? null,
		steps: body.steps.map((step, position) => ({
			position,
			agent_id: step.agent_id,
			label: step.label || null,
		})),
		created_at: timestamp,
		updated_at: timestamp,
	};
	mockState.chains.push(chain);
	return chain;
}

export function createChainRun(
	chain: Chain,
	input: string | null = null,
): ChainRun {
	const timestamp = now();
	const first = chain.steps[0];
	if (!first) {
		throw new Error("Chain has no steps");
	}
	const agent = mockState.agents.find(
		(item) =>
			item.id === first.agent_id &&
			item.owner_user_sso === chain.owner_user_sso,
	);
	if (!agent) {
		throw new Error("Agent not found");
	}
	const execution = createRun(agent, input);
	const run: ChainRun = {
		id: nextId("crun"),
		chain_id: chain.id,
		owner_user_sso: chain.owner_user_sso,
		status: "running",
		input,
		trigger: "api",
		final_result: null,
		error_code: null,
		error_message: null,
		started_at: timestamp,
		finished_at: null,
		created_at: timestamp,
		updated_at: timestamp,
	};
	const steps: ChainRunStep[] = chain.steps.map((step, index) => ({
		position: step.position,
		agent_id: step.agent_id,
		label: step.label ?? null,
		status: index === 0 ? "queued" : "pending",
		execution_id: index === 0 ? execution.id : null,
		input: index === 0 ? input : null,
		result: null,
		error_code: null,
		error_message: null,
	}));
	mockState.chainRuns.push(run);
	mockState.chainRunSteps.set(run.id, steps);
	return run;
}

export function chainRunSummary(run: ChainRun): ChainRun {
	const { ...summary } = run;
	return summary;
}

function handoffInput(result: ExecutionResult | null | undefined): string {
	const output = result?.output ?? "";
	let text = `Previous step output:\n${output}`;
	const calls = Array.isArray(result?.tool_calls) ? result.tool_calls : [];
	const bodies: Array<{ name: string; body: string }> = [];
	for (const call of calls) {
		if (!call || typeof call !== "object") continue;
		const record = call as Record<string, unknown>;
		const body =
			typeof record.response_body === "string" ? record.response_body : "";
		if (!body.trim()) continue;
		const name =
			typeof record.name === "string" && record.name ? record.name : "tool";
		bodies.push({ name, body });
	}
	if (bodies.length === 0) return text;
	text += "\n\nPrevious step tool results:\n";
	text += bodies.map((item) => `[${item.name}]\n${item.body}`).join("\n\n");
	return text;
}

function advanceLinkedChain(execution: Run): void {
	if (execution.status === "queued" || execution.status === "running") return;
	for (const [runId, steps] of mockState.chainRunSteps) {
		const step = steps.find((item) => item.execution_id === execution.id);
		if (!step) continue;
		const run = mockState.chainRuns.find((item) => item.id === runId);
		if (!run || run.status !== "running") return;
		const chain = mockState.chains.find((item) => item.id === run.chain_id);
		if (!chain) return;

		if (execution.status === "succeeded") {
			step.status = "succeeded";
			step.result = execution.result;
			const later = steps.filter((item) => item.position > step.position);
			if (later.length === 0) {
				run.status = "succeeded";
				run.final_result = execution.result;
				run.finished_at = now();
				run.updated_at = run.finished_at;
				return;
			}
			const nxt = later.sort((a, b) => a.position - b.position)[0];
			if (!nxt) return;
			const agent = mockState.agents.find((item) => item.id === nxt.agent_id);
			if (!agent) {
				run.status = "failed";
				run.error_code = "agent_missing";
				run.error_message = "Next chain agent was not found";
				run.finished_at = now();
				run.updated_at = run.finished_at;
				nxt.status = "failed";
				for (const skipped of later.slice(1)) skipped.status = "skipped";
				return;
			}
			const handoff = handoffInput(execution.result);
			const nextExecution = createRun(agent, handoff);
			nxt.status = "queued";
			nxt.execution_id = nextExecution.id;
			nxt.input = handoff;
			return;
		}

		step.status = "failed";
		step.result = execution.result;
		step.error_code = execution.error_code;
		step.error_message = execution.error_message;
		for (const later of steps.filter((item) => item.position > step.position)) {
			later.status = "skipped";
		}
		run.status = "failed";
		run.error_code = execution.error_code;
		run.error_message = execution.error_message;
		run.finished_at = now();
		run.updated_at = run.finished_at;
		return;
	}
}

export function advanceChainRun(run: ChainRun): void {
	const steps = mockState.chainRunSteps.get(run.id) ?? [];
	const current = steps.find(
		(step) =>
			step.execution_id &&
			(step.status === "queued" || step.status === "pending"),
	);
	if (!current?.execution_id) return;
	const execution = mockState.runs.find(
		(item) => item.id === current.execution_id,
	);
	if (!execution) return;
	advanceRun(execution);
}
