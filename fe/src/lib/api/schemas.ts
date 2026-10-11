import { z } from "zod";
import {
	CONTRACT_VERSION,
	MAX_CREDENTIAL_LENGTH,
	MAX_DESCRIPTION_LENGTH,
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

// Runs

export const runStatusSchema = z.enum([
	"queued",
	"running",
	"succeeded",
	"failed",
	"killed",
	"cancelled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSummarySchema = z.object({
	id: z.string(),
	status: runStatusSchema,
	created_at: z.string(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

// Agents (AgentRead in the backend)

// Read leniently: an agent whose stored configuration predates the schema
// renders with no calls and no schedule rather than failing the whole list.
export const agentConfigurationsSchema = z
	.object({
		primitives: z.record(z.string(), httpContractSchema).catch({}),
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

const publicUrlSchema = (requiredMessage: string) =>
	z
		.string()
		.min(1, requiredMessage)
		.superRefine((value, ctx) => {
			if (!value) return;
			const reason = unsafeUrlReason(value);
			if (reason) ctx.addIssue({ code: "custom", message: reason });
		});

// The same bounds apply to every tool type; what they mean differs (see
// tool-types.ts for the per-type helper text).
const toolOptionsInputSchema = z.object({
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
});

export const httpContractInputSchema = z
	.object({
		contractVersion: z.literal(CONTRACT_VERSION),
		method: httpMethodSchema,
		URL: publicUrlSchema("URL is required"),
		payload: z.unknown().optional(),
		xApiKey: credentialSchema.optional(),
		authorizationHeader: credentialSchema.optional(),
		options: toolOptionsInputSchema.optional(),
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

// Tool types (team task, spec/2026-10-10-agent-tool-forms/task.md)

export const toolTypeSchema = z.enum(["http", "mcp"]);
export type ToolType = z.infer<typeof toolTypeSchema>;

// Bring-your-own MCP server, in the agreed generic shape. The agents API does
// not accept it yet, so the builder validates it but does not send it.
// TODO(spec): send once the connectors API (spec/2026-10-10-connectors) is
// live, together with the per-agent allowedTools list it requires.
export const mcpToolInputSchema = z.object({
	type: z.literal("mcp"),
	contractVersion: z.literal(CONTRACT_VERSION),
	name: z.string().regex(PRIMITIVE_NAME_PATTERN, PRIMITIVE_NAME_MESSAGE),
	description: z
		.string()
		.max(
			MAX_DESCRIPTION_LENGTH,
			`Keep the description under ${MAX_DESCRIPTION_LENGTH} characters`,
		)
		.nullable()
		.optional(),
	options: toolOptionsInputSchema.nullable().optional(),
	credentials: z
		.object({
			xApiKey: credentialSchema.nullable().optional(),
			authorizationHeader: credentialSchema.nullable().optional(),
		})
		.nullable()
		.optional(),
	config: z.object({ URL: publicUrlSchema("Server URL is required") }),
});
export type McpToolInput = z.infer<typeof mcpToolInputSchema>;

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

export const runSchema = z.object({
	id: z.string(),
	agent_id: z.string(),
	status: runStatusSchema,
	output: z.string().nullable(),
	error: z.string().nullable(),
	finding_id: z.string().nullable(),
	created_at: z.string(),
	started_at: z.string().nullable(),
	finished_at: z.string().nullable(),
});
export type Run = z.infer<typeof runSchema>;

export const runEventSchema = z.object({
	id: z.string(),
	run_id: z.string(),
	ts: z.string(),
	type: z.enum(["log", "tool_call", "tool_result", "security"]),
	message: z.string(),
	data: z.record(z.string(), z.unknown()).nullable(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

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
