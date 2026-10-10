import { z } from "zod";

// Contract v1, aligned with the backend. See
// spec/2026-10-10-frontend-dashboard/plan.md. Keep this file the single place
// that knows the wire shape of the API.

const stringRecord = z.record(z.string(), z.string());

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

// Tools

export const toolKindSchema = z.enum([
	"http.get",
	"http.post",
	"db.query",
	"mcp",
]);
export type ToolKind = z.infer<typeof toolKindSchema>;

export const toolFieldSchema = z.object({
	key: z.string(),
	label: z.string(),
	type: z.enum(["text", "url", "textarea"]),
	required: z.boolean(),
});
export type ToolField = z.infer<typeof toolFieldSchema>;

export const toolDefinitionSchema = z.object({
	kind: toolKindSchema,
	name: z.string(),
	description: z.string(),
	config_fields: z.array(toolFieldSchema),
	credential_fields: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

// Unknown keys are stripped, so a leaky response never carries credentials
// into the UI.
export const toolConfigSchema = z.object({
	kind: toolKindSchema,
	config: stringRecord,
});
export type ToolConfig = z.infer<typeof toolConfigSchema>;

// Write-only: sent on create, kept out of `configurations`, never returned.
export const toolCredentialsSchema = z.object({
	tool: toolKindSchema,
	values: stringRecord,
});
export type ToolCredentials = z.infer<typeof toolCredentialsSchema>;

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

// `configurations` is untyped JSON on the backend. The frontend's convention is
// `{ tools: ToolConfig[] }`; anything else renders as an agent with no tools
// rather than failing the whole list.
export const agentConfigurationsSchema = z
	.object({ tools: z.array(toolConfigSchema).catch([]) })
	.catch({ tools: [] });
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

export const agentInputSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(255, "Keep the name under 255 characters"),
	system_prompt: z.string().trim().min(1, "Instructions are required"),
	configurations: z.object({ tools: z.array(toolConfigSchema) }),
	credentials: z.array(toolCredentialsSchema).optional(),
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
