import {
	type Agent,
	type AgentInput,
	agentInputSchema,
	type HttpContractInput,
	type HttpMethod,
	type McpToolInput,
	mcpToolInputSchema,
	type ToolType,
} from "#/lib/api/schemas";
import {
	CONTRACT_VERSION,
	minutesToTime,
	timeToMinutes,
} from "#/lib/http-contract";

// Form-side model of the agent builder: drafts as typed by the user, and the
// translation to and from the API body. Kept free of React so the rules can be
// tested directly.

export type CredentialField = "xApiKey" | "authorizationHeader";

// One flat draft per tool, whatever its type, so switching type keeps what the
// two types share (name, URL, credentials, options). Fields that belong to the
// other type are ignored when the body is built.
export type ToolDraft = {
	key: number;
	type: ToolType;
	name: string;
	url: string;
	method: HttpMethod;
	payload: string;
	description: string;
	xApiKey: string;
	authorizationHeader: string;
	// Whether the API reports a credential as already stored. Stored values
	// are never copied into inputs; the form only says one exists.
	storedCredentials: Record<CredentialField, boolean>;
	retries: string;
	timeout: string;
};

export type ScheduleDraft = { days: number[]; times: string; month: string };

export type BasicsDraft = { name: string; instructions: string };

export type FormErrors = Record<string, string>;

export const toolErrorKey = (index: number, field: string) =>
	`tools.${index}.${field}`;

export const MCP_NOT_SUPPORTED_MESSAGE =
	"MCP servers cannot be saved yet: the agents API only accepts HTTP requests. Remove this tool or switch it to an HTTP request.";

let nextKey = 1;

export function emptyTool(type: ToolType = "http"): ToolDraft {
	return {
		key: nextKey++,
		type,
		name: "",
		url: "",
		method: "GET",
		payload: "",
		description: "",
		xApiKey: "",
		authorizationHeader: "",
		storedCredentials: { xApiKey: false, authorizationHeader: false },
		retries: "",
		timeout: "",
	};
}

export function emptySchedule(): ScheduleDraft {
	return { days: [], times: "", month: "" };
}

export function draftsFromAgent(agent: Agent): {
	basics: BasicsDraft;
	tools: ToolDraft[];
	schedule: ScheduleDraft;
} {
	return {
		basics: { name: agent.title, instructions: agent.system_prompt },
		// The agents API stores HTTP contracts only.
		tools: Object.entries(agent.configurations.primitives).map(
			([name, contract]) => ({
				...emptyTool("http"),
				name,
				url: contract.URL,
				method: contract.method,
				payload:
					contract.payload !== undefined
						? JSON.stringify(contract.payload, null, 2)
						: "",
				storedCredentials: {
					xApiKey: contract.xApiKey != null,
					authorizationHeader: contract.authorizationHeader != null,
				},
				retries:
					contract.options?.retries != null
						? String(contract.options.retries)
						: "",
				timeout:
					contract.options?.timeout != null
						? String(contract.options.timeout)
						: "",
			}),
		),
		schedule: {
			days: [...agent.configurations.dayOfWeek],
			times: agent.configurations.timeOfDay.map(minutesToTime).join(", "),
			month:
				agent.configurations.month != null
					? String(agent.configurations.month)
					: "",
		},
	};
}

function parseWholeNumber(value: string): number | null | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function buildOptions(
	tool: ToolDraft,
	index: number,
	errors: FormErrors,
): { retries?: number; timeout?: number } | undefined {
	const retries = parseWholeNumber(tool.retries);
	const timeout = parseWholeNumber(tool.timeout);
	if (retries === null)
		errors[toolErrorKey(index, "retries")] = "Retries must be a whole number";
	if (timeout === null)
		errors[toolErrorKey(index, "timeout")] =
			"Timeout must be a whole number of milliseconds";
	if (retries == null && timeout == null) return undefined;
	return {
		...(retries != null ? { retries } : {}),
		...(timeout != null ? { timeout } : {}),
	};
}

// The live agents API takes the flat HTTP contract.
// TODO(spec): the generic HTTP `credentials` / `config` shape is not defined
// by the team task; move HTTP to `{ type: "http", credentials, config }` once
// it is.
function buildHttpContract(
	tool: ToolDraft,
	index: number,
	errors: FormErrors,
): HttpContractInput {
	const contract: HttpContractInput = {
		contractVersion: CONTRACT_VERSION,
		method: tool.method,
		URL: tool.url.trim(),
	};
	if (tool.method === "POST" && tool.payload.trim()) {
		try {
			contract.payload = JSON.parse(tool.payload);
		} catch {
			errors[toolErrorKey(index, "payload")] = "Payload must be valid JSON";
		}
	}
	if (tool.xApiKey) contract.xApiKey = tool.xApiKey;
	if (tool.authorizationHeader) {
		contract.authorizationHeader = tool.authorizationHeader;
	}
	const options = buildOptions(tool, index, errors);
	if (options) contract.options = options;
	return contract;
}

export function buildMcpTool(
	tool: ToolDraft,
	options: McpToolInput["options"],
): McpToolInput {
	const credentials: NonNullable<McpToolInput["credentials"]> = {};
	if (tool.xApiKey) credentials.xApiKey = tool.xApiKey;
	if (tool.authorizationHeader) {
		credentials.authorizationHeader = tool.authorizationHeader;
	}
	const description = tool.description.trim();
	return {
		type: "mcp",
		contractVersion: CONTRACT_VERSION,
		name: tool.name.trim(),
		...(description ? { description } : {}),
		...(options ? { options } : {}),
		...(Object.keys(credentials).length > 0 ? { credentials } : {}),
		config: { URL: tool.url.trim() },
	};
}

const mcpFieldKeys: Record<string, string> = {
	name: "name",
	description: "description",
	"options.retries": "retries",
	"options.timeout": "timeout",
	"credentials.xApiKey": "xApiKey",
	"credentials.authorizationHeader": "authorizationHeader",
	"config.URL": "url",
};

function validateMcpTool(tool: ToolDraft, index: number, errors: FormErrors) {
	const options = buildOptions(tool, index, errors);
	const parsed = mcpToolInputSchema.safeParse(buildMcpTool(tool, options));
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const field = mcpFieldKeys[issue.path.join(".")] ?? "type";
			const key = toolErrorKey(index, field);
			if (!(key in errors)) errors[key] = issue.message;
		}
	}
	// Validated in full so the user sees every problem, but never sent.
	errors[toolErrorKey(index, "type")] = MCP_NOT_SUPPORTED_MESSAGE;
}

const contractFieldKeys: Record<string, string> = {
	URL: "url",
	payload: "payload",
	xApiKey: "xApiKey",
	authorizationHeader: "authorizationHeader",
	"options.retries": "retries",
	"options.timeout": "timeout",
};

// Maps an API body path (from zod or the server) onto the form field that
// produced it. `toolIndex` resolves a primitive name to its tool's position.
function errorKeyForPath(
	path: string[],
	toolIndex: (name: string) => number,
): string {
	if (path[0] !== "configurations") return "form";
	if (path[1] === "primitives") {
		const index = toolIndex(path[2] ?? "");
		if (index < 0) return "form";
		const rest = path.slice(3).join(".");
		if (!rest) return toolErrorKey(index, "name");
		return toolErrorKey(index, contractFieldKeys[rest] ?? "name");
	}
	if (path[1] === "timeOfDay") return "schedule.times";
	if (path[1] === "dayOfWeek") return "schedule.days";
	if (path[1] === "month") return "schedule.month";
	return "form";
}

export function errorsFromServer(
	fields: Record<string, string>,
	primitiveIndex: Record<string, number>,
): FormErrors {
	const errors: FormErrors = {};
	const toolIndex = (name: string) => primitiveIndex[name] ?? -1;
	for (const [field, message] of Object.entries(fields)) {
		const key = errorKeyForPath(field.split("."), toolIndex);
		if (!(key in errors)) errors[key] = message;
	}
	return errors;
}

// Turns the drafts into the create body, collecting problems zod cannot see
// from the raw strings (duplicate names, non-JSON payloads, non-numbers) and
// refusing tool types the API does not accept yet. `primitiveIndex` maps each
// sent primitive name back to its tool, for server-side errors.
export function buildInput(
	basics: BasicsDraft,
	tools: ToolDraft[],
	schedule: ScheduleDraft,
): {
	input: AgentInput;
	errors: FormErrors;
	primitiveIndex: Record<string, number>;
} {
	const errors: FormErrors = {};
	const primitives: Record<string, HttpContractInput> = {};
	const primitiveIndex: Record<string, number> = {};
	const seen = new Set<string>();

	tools.forEach((tool, index) => {
		const name = tool.name.trim();
		if (!name) errors[toolErrorKey(index, "name")] = "Tool name is required";
		else if (seen.has(name))
			errors[toolErrorKey(index, "name")] = "Tool names must be unique";
		seen.add(name);

		if (tool.type === "mcp") {
			validateMcpTool(tool, index, errors);
			return;
		}
		const key = name || `tool_${index + 1}`;
		primitives[key] = buildHttpContract(tool, index, errors);
		primitiveIndex[key] = index;
	});

	const timeOfDay: number[] = [];
	for (const part of schedule.times.split(",")) {
		if (!part.trim()) continue;
		const minutes = timeToMinutes(part);
		if (minutes === null) {
			errors["schedule.times"] = "Times must look like 09:00 or 17:30";
		} else {
			timeOfDay.push(minutes);
		}
	}

	const input: AgentInput = {
		agentTitle: basics.name.trim(),
		systemPrompt: basics.instructions.trim(),
		configurations: {
			primitives,
			...(schedule.month ? { month: Number(schedule.month) } : {}),
			dayOfWeek: [...schedule.days].sort((a, b) => a - b),
			timeOfDay: Array.from(new Set(timeOfDay)).sort((a, b) => a - b),
		},
	};

	const parsed = agentInputSchema.safeParse(input);
	if (!parsed.success) {
		const toolIndex = (name: string) => primitiveIndex[name] ?? -1;
		for (const issue of parsed.error.issues) {
			const key = errorKeyForPath(issue.path.map(String), toolIndex);
			if (!(key in errors)) errors[key] = issue.message;
		}
	}
	return { input, errors, primitiveIndex };
}
