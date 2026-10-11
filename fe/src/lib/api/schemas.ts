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

export const executionSchema = z.object({
	id: z.string(),
	agent_id: z.string(),
	owner_user_sso: z.string(),
	status: executionStatusSchema,
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

export const connectorTypeSchema = z.enum(["http", "mcp"]);
export type ConnectorType = z.infer<typeof connectorTypeSchema>;

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

export const connectorCreateSchema = z.object({
	type: z.literal("http"),
	contractVersion: z.literal(CONTRACT_VERSION),
	name: z.string().regex(PRIMITIVE_NAME_PATTERN, PRIMITIVE_NAME_MESSAGE),
	description: z.string().optional(),
	config: z.object({
		method: httpMethodSchema,
		URL: z
			.string()
			.min(1, "URL is required")
			.superRefine((value, ctx) => {
				const reason = unsafeUrlReason(value);
				if (reason) ctx.addIssue({ code: "custom", message: reason });
			}),
		payload: z.unknown().optional(),
	}),
	credentials: z
		.object({
			xApiKey: z.string().optional(),
			authorizationHeader: z.string().optional(),
		})
		.optional(),
	options: httpOptionsSchema.optional(),
});
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

// Names are validated here rather than as record keys so the message and the
// issue path (the offending name) are ours.
const primitivesInputSchema = z
	.record(z.string(), httpContractInputSchema)
	.superRefine((primitives, ctx) => {
		const names = Object.keys(primitives);
		for (const name of names) {
			if (!PRIMITIVE_NAME_PATTERN.test(name)) {
				ctx.addIssue({
					code: "custom",
					path: [name],
					message: PRIMITIVE_NAME_MESSAGE,
				});
			}
		}
		if (names.length > MAX_PRIMITIVES_PER_AGENT) {
			ctx.addIssue({
				code: "custom",
				message: `At most ${MAX_PRIMITIVES_PER_AGENT} HTTP calls per agent`,
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

export function connectorCreateFromHttpCall(
	name: string,
	contract: HttpContractInput,
): ConnectorCreate {
	const credentials: ConnectorCreate["credentials"] = {};
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
