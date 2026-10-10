import { z } from "zod";

// Contract v0. See spec/2026-10-10-frontend-dashboard/plan.md. Keep this file the
// single place that knows the wire shape of the API.

const stringRecord = z.record(z.string(), z.string());

export const userSchema = z.object({
	id: z.string(),
	email: z.string(),
	created_at: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const credentialsSchema = z.object({
	email: z.email("Enter a valid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});
export type Credentials = z.infer<typeof credentialsSchema>;

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

// Response shape: credentials are never returned, and unknown keys are stripped,
// so a leaky server response still never reaches the UI.
export const toolConfigSchema = z.object({
	kind: toolKindSchema,
	config: stringRecord,
});
export type ToolConfig = z.infer<typeof toolConfigSchema>;

// Input shape: credentials are write-only.
export const toolConfigInputSchema = toolConfigSchema.extend({
	credentials: stringRecord.optional(),
});
export type ToolConfigInput = z.infer<typeof toolConfigInputSchema>;

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

export const agentSchema = z.object({
	id: z.string(),
	name: z.string(),
	instructions: z.string(),
	tools: z.array(toolConfigSchema),
	status: z.enum(["active", "disabled"]),
	flagged: z.boolean(),
	last_run: runSummarySchema.nullable(),
	created_at: z.string(),
	updated_at: z.string(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(80, "Keep the name under 80 characters"),
	instructions: z.string().trim().min(1, "Instructions are required"),
	tools: z.array(toolConfigInputSchema),
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

export const apiErrorBodySchema = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		fields: stringRecord.optional(),
	}),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export const collection = <T extends z.ZodType>(item: T) =>
	z.object({ items: z.array(item) });
