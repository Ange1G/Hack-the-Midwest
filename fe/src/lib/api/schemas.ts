import { z } from "zod";
import {
	CONTRACT_VERSION,
	MAX_CREDENTIAL_LENGTH,
	MAX_PRIMITIVES_PER_AGENT,
	MAX_RETRIES,
	MAX_SYSTEM_PROMPT_LENGTH,
	MAX_TIMEOUT_MS,
	MIN_TIMEOUT_MS,
	PRIMITIVE_NAME_MESSAGE,
	PRIMITIVE_NAME_PATTERN,
	SECRET_PLACEHOLDER,
	unsafeUrlReason,
} from "#/lib/http-contract";

// Contract v2, aligned with the backend and the team spec. See
// spec/2026-10-10-frontend-dashboard/plan.md and api/README.md. Keep this
// file the single place that knows the wire shape of the API.

// Envelope (api/src/app/common/envelope.py)

export const apiErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	details: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const paginationSchema = z.object({
	page: z.number().int(),
	page_size: z.number().int(),
	total_items: z.number().int(),
	total_pages: z.number().int(),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const metadataSchema = z.object({ request_id: z.string() });

export const envelope = <T extends z.ZodType>(data: T) =>
	z.object({
		data: data.nullable(),
		error: apiErrorSchema.nullable(),
		metadata: metadataSchema,
		pagination: paginationSchema.nullable().optional(),
	});

// Identity (development header auth)

export const signInInputSchema = z.object({
	user_sso: z
		.string()
		.trim()
		.min(1, "Enter your SSO id")
		.max(255, "Keep the SSO id under 255 characters")
		.regex(/^\S+$/, "The SSO id cannot contain spaces"),
});
export type SignInInput = z.infer<typeof signInInputSchema>;

// HTTP contract (team spec; api/src/app/domains/primitives/http_contract.py)

export const httpMethodSchema = z.enum(["GET", "POST"]);
export type HttpMethod = z.infer<typeof httpMethodSchema>;

export const httpOptionsSchema = z.object({
	retries: z.number().int().min(0).max(MAX_RETRIES).nullable().optional(),
	timeout: z
		.number()
		.int()
		.min(MIN_TIMEOUT_MS)
		.max(MAX_TIMEOUT_MS)
		.nullable()
		.optional(),
});
export type HttpOptions = z.infer<typeof httpOptionsSchema>;

// As stored and returned: credentials come back as the placeholder, and
// fields the backend left unset are absent.
export const httpContractSchema = z.object({
	contractVersion: z.literal(CONTRACT_VERSION),
	method: httpMethodSchema,
	URL: z.string(),
	payload: z.unknown().optional(),
	xApiKey: z.string().nullable().optional(),
	authorizationHeader: z.string().nullable().optional(),
	options: httpOptionsSchema.nullable().optional(),
});
export type HttpContract = z.infer<typeof httpContractSchema>;

// Executions (backend: AgentExecution / ExecutionRead)

export const executionStatusSchema = z.enum([
	"queued",
	"running",
	"succeeded",
	"failed",
	"timed_out",
]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
/** @deprecated Use ExecutionStatus. Kept so existing UI names still compile. */
export type RunStatus = ExecutionStatus;
export const runStatusSchema = executionStatusSchema;

export const executionResultSchema = z.object({
	output: z.string().nullable().optional(),
	model: z.string().nullable().optional(),
	tool_calls: z.array(z.unknown()).nullable().optional(),
});
export type ExecutionResult = z.infer<typeof executionResultSchema>;

export const MAX_RUN_INPUT_LENGTH = 20_000;

export const executionCreateSchema = z.object({
	input: z
		.string()
		.max(MAX_RUN_INPUT_LENGTH)
		.nullable()
		.optional()
		.transform((value) => {
			if (value == null) return undefined;
			const trimmed = value.trim();
			return trimmed ? trimmed : undefined;
		}),
});
export type ExecutionCreate = z.infer<typeof executionCreateSchema>;

export const executionSchema = z.object({
	id: z.string(),
	agent_id: z.string(),
	owner_user_sso: z.string(),
	status: executionStatusSchema,
	input: z.string().nullable().optional().default(null),
	result: executionResultSchema.nullable(),
	error_code: z.string().nullable(),
	error_message: z.string().nullable(),
	runner_meta: z.record(z.string(), z.unknown()).nullable(),
	started_at: z.string().nullable(),
	finished_at: z.string().nullable(),
	created_at: z.string(),
	updated_at: z.string(),
});
export type Execution = z.infer<typeof executionSchema>;
/** @deprecated Use Execution. */
export type Run = Execution;
export const runSchema = executionSchema;

export const runSummarySchema = z.object({
	id: z.string(),
	status: executionStatusSchema,
	created_at: z.string(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

// Connectors (backend: ConnectorRead)

export const connectorTypeSchema = z.enum(["http", "mcp", "database"]);
export type ConnectorType = z.infer<typeof connectorTypeSchema>;

export const connectorTypeCatalogSchema = z.object({
	type: z.string(),
	name: z.string(),
	description: z.string(),
	credential_fields: z.array(z.string()),
	config_schema: z.record(z.string(), z.unknown()),
});
export type ConnectorTypeCatalog = z.infer<typeof connectorTypeCatalogSchema>;

export const connectorReferenceSchema = z
	.object({
		allowedTools: z.array(z.string()).min(1).optional(),
	})
	.passthrough();
export type ConnectorReference = z.infer<typeof connectorReferenceSchema>;

export const connectorSchema = z.object({
	id: z.string(),
	owner_user_sso: z.string(),
	type: z.string(),
	name: z.string(),
	contract: z.record(z.string(), z.unknown()),
	created_at: z.string(),
	updated_at: z.string(),
});
export type Connector = z.infer<typeof connectorSchema>;

const connectorNameSchema = z
	.string()
	.regex(PRIMITIVE_NAME_PATTERN, PRIMITIVE_NAME_MESSAGE);

const publicUrlSchema = z
	.string()
	.min(1, "URL is required")
	.superRefine((value, ctx) => {
		const reason = unsafeUrlReason(value);
		if (reason) ctx.addIssue({ code: "custom", message: reason });
	});

const headerCredentialsSchema = z
	.object({
		xApiKey: z.string().optional(),
		authorizationHeader: z.string().optional(),
	})
	.optional();

export const httpConnectorCreateSchema = z
	.object({
		type: z.literal("http"),
		contractVersion: z.literal(CONTRACT_VERSION),
		name: connectorNameSchema,
		description: z.string().optional(),
		config: z.object({
			method: httpMethodSchema,
			URL: publicUrlSchema,
			payload: z.unknown().optional(),
		}),
		credentials: headerCredentialsSchema,
		options: httpOptionsSchema.optional(),
	})
	.superRefine((body, ctx) => {
		if (body.config.method === "GET" && body.config.payload !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["config", "payload"],
				message:
					"GET requests cannot include a payload; put parameters in the URL",
			});
		}
	});

export const mcpConnectorCreateSchema = z.object({
	type: z.literal("mcp"),
	contractVersion: z.literal(CONTRACT_VERSION),
	name: connectorNameSchema,
	description: z.string().optional(),
	config: z.object({
		URL: publicUrlSchema,
	}),
	credentials: headerCredentialsSchema,
	options: httpOptionsSchema.optional(),
});

export const databaseEngineSchema = z.enum([
	"postgres",
	"mysql",
	"mongodb",
	"redis",
]);

export const databaseConnectorCreateSchema = z
	.object({
		type: z.literal("database"),
		contractVersion: z.literal(CONTRACT_VERSION),
		name: connectorNameSchema,
		description: z.string().optional(),
		credentials: z
			.object({
				username: z.string().optional(),
				password: z.string().optional(),
			})
			.optional(),
		config: z.discriminatedUnion("mode", [
			z.object({
				mode: z.literal("external"),
				engine: databaseEngineSchema,
				host: z
					.string()
					.min(1, "Host is required")
					.superRefine((value, ctx) => {
						const reason = unsafeUrlReason(`https://${value}`);
						if (reason) ctx.addIssue({ code: "custom", message: reason });
					}),
				database: z.string().optional(),
				access: z.enum(["readOnly", "readWrite"]).optional(),
			}),
			z.object({
				mode: z.literal("provisioned"),
				engine: databaseEngineSchema,
				lifecycle: z.enum(["agent", "run"]).optional(),
			}),
		]),
	})
	.superRefine((body, ctx) => {
		if (body.config.mode !== "external") return;
		if (body.config.engine !== "redis" && !body.config.database) {
			ctx.addIssue({
				code: "custom",
				path: ["config", "database"],
				message: "Database is required",
			});
		}
		if (body.config.engine !== "redis" && !body.credentials?.username) {
			ctx.addIssue({
				code: "custom",
				path: ["credentials", "username"],
				message: "Username is required",
			});
		}
		if (!body.credentials?.password) {
			ctx.addIssue({
				code: "custom",
				path: ["credentials", "password"],
				message: "Password is required",
			});
		}
	});

export const connectorCreateSchema = z.discriminatedUnion("type", [
	httpConnectorCreateSchema,
	mcpConnectorCreateSchema,
	databaseConnectorCreateSchema,
]);
export type ConnectorCreate = z.infer<typeof connectorCreateSchema>;

// Agents (AgentRead in the backend)

// Read leniently: an agent whose stored configuration predates the schema
// renders with no calls and no schedule rather than failing the whole list.
export const agentConfigurationsSchema = z
	.object({
		primitives: z.record(z.string(), connectorReferenceSchema).catch({}),
		month: z
			.number()
			.int()
			.min(1)
			.max(12)
			.nullable()
			.optional()
			.catch(undefined),
		dayOfWeek: z.array(z.number().int().min(0).max(6)).catch([]),
		timeOfDay: z.array(z.number().int().min(0).max(1439)).catch([]),
	})
	.catch({ primitives: {}, dayOfWeek: [], timeOfDay: [] });
export type AgentConfigurations = z.infer<typeof agentConfigurationsSchema>;

export const agentSchema = z.object({
	id: z.string(),
	title: z.string(),
	system_prompt: z.string(),
	configurations: agentConfigurationsSchema,
	schedule_month: z.number().int().nullable(),
	schedule_day: z.number().int().nullable(),
	schedule_time: z.string().nullable(),
	owner_user_sso: z.string(),
	created_at: z.string(),
	updated_at: z.string(),
	// Not in the backend yet; defaulted so the real API works today.
	flagged: z.boolean().default(false),
	last_run: runSummarySchema.nullable().default(null),
});
export type Agent = z.infer<typeof agentSchema>;

// Create body (POST /agents/{user_sso}; camelCase per the team spec)

const credentialSchema = z
	.string()
	.min(1, "Enter the credential")
	.max(
		MAX_CREDENTIAL_LENGTH,
		`Keep credentials under ${MAX_CREDENTIAL_LENGTH} characters`,
	)
	.refine(
		(value) => value !== SECRET_PLACEHOLDER,
		"Provide the actual credential, not the placeholder",
	);

export const httpContractInputSchema = z
	.object({
		contractVersion: z.literal(CONTRACT_VERSION),
		method: httpMethodSchema,
		URL: z
			.string()
			.min(1, "URL is required")
			.superRefine((value, ctx) => {
				if (!value) return;
				const reason = unsafeUrlReason(value);
				if (reason) ctx.addIssue({ code: "custom", message: reason });
			}),
		payload: z.unknown().optional(),
		xApiKey: credentialSchema.optional(),
		authorizationHeader: credentialSchema.optional(),
		options: z
			.object({
				retries: z
					.number()
					.int("Retries must be a whole number")
					.min(0, `Retries must be between 0 and ${MAX_RETRIES}`)
					.max(MAX_RETRIES, `Retries must be between 0 and ${MAX_RETRIES}`)
					.optional(),
				timeout: z
					.number()
					.int("Timeout must be a whole number of milliseconds")
					.min(
						MIN_TIMEOUT_MS,
						`Timeout must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms`,
					)
					.max(
						MAX_TIMEOUT_MS,
						`Timeout must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms`,
					)
					.optional(),
			})
			.optional(),
	})
	.superRefine((contract, ctx) => {
		if (contract.method === "GET" && contract.payload !== undefined) {
			ctx.addIssue({
				code: "custom",
				path: ["payload"],
				message:
					"GET requests cannot include a payload; put parameters in the URL",
			});
		}
	});
export type HttpContractInput = z.infer<typeof httpContractInputSchema>;

const MCP_TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const MAX_ALLOWED_TOOLS = 100;

export const connectorReferenceInputSchema = z.object({
	allowedTools: z
		.array(
			z
				.string()
				.regex(
					MCP_TOOL_NAME,
					"Tool names are letters, digits, underscores, dots and hyphens",
				),
		)
		.min(1, "List at least one tool")
		.max(MAX_ALLOWED_TOOLS, `At most ${MAX_ALLOWED_TOOLS} tools`)
		.optional(),
});
export type ConnectorReferenceInput = z.infer<
	typeof connectorReferenceInputSchema
>;

const primitivesInputSchema = z
	.record(z.string().min(1), connectorReferenceInputSchema)
	.superRefine((primitives, ctx) => {
		if (Object.keys(primitives).length > MAX_PRIMITIVES_PER_AGENT) {
			ctx.addIssue({
				code: "custom",
				message: `At most ${MAX_PRIMITIVES_PER_AGENT} connectors per agent`,
			});
		}
	});

export const agentInputSchema = z.object({
	agentTitle: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(255, "Keep the name under 255 characters"),
	systemPrompt: z
		.string()
		.trim()
		.min(1, "Instructions are required")
		.max(
			MAX_SYSTEM_PROMPT_LENGTH,
			`Keep the instructions under ${MAX_SYSTEM_PROMPT_LENGTH} characters`,
		),
	configurations: z.object({
		primitives: primitivesInputSchema,
		month: z
			.number()
			.int()
			.min(1, "Month must be between 1 and 12")
			.max(12, "Month must be between 1 and 12")
			.nullable()
			.optional(),
		dayOfWeek: z
			.array(
				z
					.number()
					.int()
					.min(0, "Days are 0 (Sunday) to 6 (Saturday)")
					.max(6, "Days are 0 (Sunday) to 6 (Saturday)"),
			)
			.max(7),
		timeOfDay: z
			.array(
				z
					.number()
					.int()
					.min(0, "Times are minutes after midnight, 0 to 1439")
					.max(1439, "Times are minutes after midnight, 0 to 1439"),
			)
			.max(48, "At most 48 times per day"),
	}),
});
export type AgentInput = z.infer<typeof agentInputSchema>;

export const agentUpdateSchema = z
	.object({
		agentTitle: agentInputSchema.shape.agentTitle.optional(),
		systemPrompt: agentInputSchema.shape.systemPrompt.optional(),
		configurations: agentInputSchema.shape.configurations.optional(),
	})
	.refine(
		(value) =>
			value.agentTitle !== undefined ||
			value.systemPrompt !== undefined ||
			value.configurations !== undefined,
		{ message: "Provide at least one field to update" },
	);
export type AgentUpdate = z.infer<typeof agentUpdateSchema>;

export const runEventSchema = z.object({
	id: z.string(),
	run_id: z.string(),
	ts: z.string(),
	type: z.enum(["log", "tool_call", "tool_result", "security"]),
	message: z.string(),
	data: z.record(z.string(), z.unknown()).nullable(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

export const webhookSchema = z.object({
	id: z.string(),
	owner_user_sso: z.string(),
	target_type: z.enum(["agent", "chain"]).default("agent"),
	target_agent_id: z.string().nullable().optional(),
	target_chain_id: z.string().nullable().optional(),
	secret: z.string(),
	disabled: z.boolean(),
	created_at: z.string(),
});
export type Webhook = z.infer<typeof webhookSchema>;

export const webhookCreateSchema = z
	.object({
		target_type: z.enum(["agent", "chain"]).default("agent"),
		target_agent_id: z.string().optional(),
		target_chain_id: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.target_type === "chain") {
			if (!value.target_chain_id) {
				ctx.addIssue({
					code: "custom",
					path: ["target_chain_id"],
					message: "Choose a chain",
				});
			}
		} else if (!value.target_agent_id) {
			ctx.addIssue({
				code: "custom",
				path: ["target_agent_id"],
				message: "Choose an agent",
			});
		}
	});
export type WebhookCreate = z.input<typeof webhookCreateSchema>;

export const chainScheduleSchema = z.object({
	month: z.number().int().min(1).max(12).nullable().optional(),
	dayOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
	timeOfDay: z.array(z.number().int().min(0).max(1439)).max(48).optional(),
});
export type ChainSchedule = z.infer<typeof chainScheduleSchema>;

export const chainStepReadSchema = z.object({
	position: z.number().int().min(0),
	agent_id: z.string(),
	label: z.string().nullable().optional(),
});
export type ChainStepRead = z.infer<typeof chainStepReadSchema>;

export const chainSchema = z.object({
	id: z.string(),
	owner_user_sso: z.string(),
	title: z.string(),
	schedule: chainScheduleSchema.nullable().optional(),
	steps: z.array(chainStepReadSchema),
	created_at: z.string(),
	updated_at: z.string(),
});
export type Chain = z.infer<typeof chainSchema>;

export const chainStepCreateSchema = z.object({
	agent_id: z.string().min(1, "Choose an agent"),
	label: z.string().trim().max(64).optional(),
});
export type ChainStepCreate = z.infer<typeof chainStepCreateSchema>;

export const chainCreateSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(255, "Keep the name under 255 characters"),
	steps: z
		.array(chainStepCreateSchema)
		.min(1, "Add at least one step")
		.max(20, "A chain may have at most 20 steps"),
	schedule: chainScheduleSchema.nullable().optional(),
});
export type ChainCreate = z.infer<typeof chainCreateSchema>;

export const chainRunStatusSchema = z.enum(["running", "succeeded", "failed"]);
export type ChainRunStatus = z.infer<typeof chainRunStatusSchema>;

export const chainRunSchema = z.object({
	id: z.string(),
	chain_id: z.string(),
	owner_user_sso: z.string(),
	status: chainRunStatusSchema,
	input: z.string().nullable().optional(),
	trigger: z.string(),
	final_result: executionResultSchema.nullable().optional(),
	error_code: z.string().nullable().optional(),
	error_message: z.string().nullable().optional(),
	started_at: z.string(),
	finished_at: z.string().nullable().optional(),
	created_at: z.string(),
	updated_at: z.string(),
});
export type ChainRun = z.infer<typeof chainRunSchema>;

export const chainRunStepStatusSchema = z.enum([
	"pending",
	"queued",
	"succeeded",
	"failed",
	"skipped",
]);
export type ChainRunStepStatus = z.infer<typeof chainRunStepStatusSchema>;

export const chainRunStepSchema = z.object({
	position: z.number().int().min(0),
	agent_id: z.string(),
	label: z.string().nullable().optional(),
	status: chainRunStepStatusSchema,
	execution_id: z.string().nullable().optional(),
	input: z.string().nullable().optional(),
	result: executionResultSchema.nullable().optional(),
	error_code: z.string().nullable().optional(),
	error_message: z.string().nullable().optional(),
});
export type ChainRunStep = z.infer<typeof chainRunStepSchema>;

export const findingSchema = z.object({
	id: z.string(),
	run_id: z.string(),
	agent_id: z.string(),
	severity: z.enum(["low", "medium", "high", "critical"]),
	rule: z.string(),
	message: z.string(),
	action: z.enum(["flagged", "killed"]),
	created_at: z.string(),
});
export type Finding = z.infer<typeof findingSchema>;

/** Map a stored HTTP connector onto the display shape the UI already uses. */
export function httpContractFromConnector(
	connector: Connector,
): HttpContract | null {
	if (connector.type !== "http") return null;
	const contract = connector.contract;
	const config =
		contract.config && typeof contract.config === "object"
			? (contract.config as Record<string, unknown>)
			: {};
	const credentials =
		contract.credentials && typeof contract.credentials === "object"
			? (contract.credentials as Record<string, unknown>)
			: {};
	const options =
		contract.options && typeof contract.options === "object"
			? (contract.options as Record<string, unknown>)
			: null;
	const method = config.method === "POST" ? "POST" : "GET";
	const URL = typeof config.URL === "string" ? config.URL : "";
	const parsedOptions = httpOptionsSchema.nullable().safeParse(options);
	return {
		contractVersion: CONTRACT_VERSION,
		method,
		URL,
		...(config.payload !== undefined ? { payload: config.payload } : {}),
		...(typeof credentials.xApiKey === "string"
			? { xApiKey: credentials.xApiKey }
			: {}),
		...(typeof credentials.authorizationHeader === "string"
			? { authorizationHeader: credentials.authorizationHeader }
			: {}),
		...(parsedOptions.success && parsedOptions.data
			? { options: parsedOptions.data }
			: {}),
	};
}

export function connectorConfigRecord(
	connector: Connector,
): Record<string, unknown> {
	const config = connector.contract.config;
	return config && typeof config === "object"
		? (config as Record<string, unknown>)
		: {};
}

export function connectorLabel(type: string): string {
	if (type === "http") return "HTTP";
	if (type === "mcp") return "MCP";
	if (type === "database") return "Database";
	return type;
}

export function connectorCreateFromHttpCall(
	name: string,
	contract: HttpContractInput,
): z.infer<typeof httpConnectorCreateSchema> {
	const credentials: {
		xApiKey?: string;
		authorizationHeader?: string;
	} = {};
	if (contract.xApiKey) credentials.xApiKey = contract.xApiKey;
	if (contract.authorizationHeader) {
		credentials.authorizationHeader = contract.authorizationHeader;
	}
	return {
		type: "http",
		contractVersion: CONTRACT_VERSION,
		name,
		config: {
			method: contract.method,
			URL: contract.URL,
			...(contract.payload !== undefined ? { payload: contract.payload } : {}),
		},
		...(Object.keys(credentials).length > 0 ? { credentials } : {}),
		...(contract.options ? { options: contract.options } : {}),
	};
}
