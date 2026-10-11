import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	agentInputSchema,
	agentSchema,
	chainCreateSchema,
	chainRunSchema,
	chainSchema,
	connectorCreateSchema,
	envelope,
	executionCreateSchema,
	findingSchema,
	runSchema,
	webhookSchema,
} from "./schemas";

// Exactly what POST/GET /api/v1/agents/{user_sso} return per the backend's
// tests: credentials come back masked, absent fields are omitted.
const backendAgent = {
	id: "0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e11",
	title: "Weekday GitHub digest",
	system_prompt: "Summarize yesterday's new issues.",
	configurations: {
		primitives: {
			"0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e12": {},
			"0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e13": {
				allowedTools: ["search_issues"],
			},
		},
		dayOfWeek: [1, 2, 3, 4, 5],
		timeOfDay: [540],
	},
	schedule_month: null,
	schedule_day: null,
	schedule_time: null,
	owner_user_sso: "sso-user-a",
	created_at: "2026-10-10T19:00:00+00:00",
	updated_at: "2026-10-10T19:00:00+00:00",
};

const validRun = {
	id: "run_1",
	agent_id: backendAgent.id,
	owner_user_sso: "sso-user-a",
	status: "queued",
	input: null,
	result: null,
	error_code: null,
	error_message: null,
	runner_meta: null,
	created_at: "2026-10-10T19:05:00Z",
	updated_at: "2026-10-10T19:05:00Z",
	started_at: null,
	finished_at: null,
};

const validInput = {
	agentTitle: "Weekday GitHub digest",
	systemPrompt: "Summarize yesterday's new issues.",
	configurations: {
		primitives: {
			"0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e12": {},
			"0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e13": {
				allowedTools: ["search_issues"],
			},
		},
		dayOfWeek: [1, 2, 3, 4, 5],
		timeOfDay: [540],
	},
};

function issueMessages(input: unknown): string[] {
	const result = agentInputSchema.safeParse(input);
	return result.success
		? []
		: result.error.issues.map((issue) => issue.message);
}

describe("agentSchema", () => {
	it("parses an agent as the backend returns it and defaults fields it does not send yet", () => {
		const parsed = agentSchema.parse(backendAgent);
		expect(parsed).toMatchObject({
			id: backendAgent.id,
			title: "Weekday GitHub digest",
			owner_user_sso: "sso-user-a",
		});
		expect(
			parsed.configurations.primitives["0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e12"],
		).toEqual({});
		expect(
			parsed.configurations.primitives["0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e13"],
		).toEqual({ allowedTools: ["search_issues"] });
		expect(parsed.configurations.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
		expect(parsed.configurations.timeOfDay).toEqual([540]);
		expect(parsed.configurations.month).toBeUndefined();
		expect(parsed.flagged).toBe(false);
		expect(parsed.last_run).toBeNull();
	});

	it("keeps the run summary and flag when a response includes them", () => {
		const parsed = agentSchema.parse({
			...backendAgent,
			flagged: true,
			last_run: {
				id: "run_1",
				status: "failed",
				created_at: "2026-10-10T19:05:00Z",
			},
		});
		expect(parsed.flagged).toBe(true);
		expect(parsed.last_run?.status).toBe("failed");
	});

	it("tolerates configurations that do not follow the schema", () => {
		const legacy = agentSchema.parse({
			...backendAgent,
			configurations: { tools: ["HTTP.GET"] },
		});
		expect(legacy.configurations.primitives).toEqual({});
		expect(legacy.configurations.dayOfWeek).toEqual([]);

		const empty = agentSchema.parse({ ...backendAgent, configurations: {} });
		expect(empty.configurations.primitives).toEqual({});
		expect(empty.configurations.timeOfDay).toEqual([]);
	});
});

describe("agentInputSchema", () => {
	it("accepts the backend's documented create body", () => {
		expect(agentInputSchema.safeParse(validInput).success).toBe(true);
	});

	it("requires a title and a system prompt", () => {
		const messages = issueMessages({
			...validInput,
			agentTitle: "   ",
			systemPrompt: "",
		});
		expect(messages).toContain("Name is required");
		expect(messages).toContain("Instructions are required");
	});

	it("accepts connector UUID references and MCP allowedTools", () => {
		expect(agentInputSchema.safeParse(validInput).success).toBe(true);
	});

	it("refuses an empty allowedTools list", () => {
		const messages = issueMessages({
			...validInput,
			configurations: {
				...validInput.configurations,
				primitives: {
					"0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e13": { allowedTools: [] },
				},
			},
		});
		expect(messages).toContain("List at least one tool");
	});

	it("bounds the schedule values", () => {
		const messages = issueMessages({
			...validInput,
			configurations: {
				...validInput.configurations,
				month: 13,
				dayOfWeek: [7],
				timeOfDay: [1440],
			},
		});
		expect(messages).toHaveLength(3);
	});
});

describe("envelope", () => {
	it("parses a success envelope with pagination", () => {
		const parsed = envelope(z.array(agentSchema)).parse({
			data: [backendAgent],
			error: null,
			metadata: { request_id: "req_1" },
			pagination: { page: 1, page_size: 20, total_items: 1, total_pages: 1 },
		});
		expect(parsed.data).toHaveLength(1);
		expect(parsed.pagination?.total_items).toBe(1);
		expect(parsed.error).toBeNull();
	});

	it("parses an error envelope", () => {
		const parsed = envelope(z.unknown()).parse({
			data: null,
			error: {
				code: "invalid_configuration",
				message: "Agent configuration is invalid",
				details: {
					errors: [
						{
							field: "configurations.primitives.m.URL",
							message: "Internal hostnames are not allowed",
						},
					],
				},
			},
			metadata: { request_id: "req_2" },
			pagination: null,
		});
		expect(parsed.data).toBeNull();
		expect(parsed.error?.code).toBe("invalid_configuration");
	});
});

describe("runSchema", () => {
	it("parses a valid execution", () => {
		expect(runSchema.parse(validRun)).toEqual(validRun);
	});

	it("parses a succeeded execution with nested result output", () => {
		const parsed = runSchema.parse({
			...validRun,
			status: "succeeded",
			result: { output: "all checks passed", model: "gpt-4o-mini" },
		});
		expect(parsed.result?.output).toBe("all checks passed");
	});

	it("accepts timed_out", () => {
		expect(runSchema.parse({ ...validRun, status: "timed_out" }).status).toBe(
			"timed_out",
		);
	});

	it("rejects an unknown status", () => {
		expect(() =>
			runSchema.parse({ ...validRun, status: "exploded" }),
		).toThrow();
	});
});

describe("executionCreateSchema", () => {
	it("trims input and drops blank values", () => {
		expect(executionCreateSchema.parse({ input: "  ticket  " })).toEqual({
			input: "ticket",
		});
		expect(executionCreateSchema.parse({ input: "   " })).toEqual({});
		expect(executionCreateSchema.parse({})).toEqual({});
	});

	it("refuses input longer than 20_000 characters", () => {
		expect(
			executionCreateSchema.safeParse({ input: "x".repeat(20_001) }).success,
		).toBe(false);
	});
});

describe("connectorCreateSchema", () => {
	it("refuses private HTTP URLs", () => {
		const result = connectorCreateSchema.safeParse({
			type: "http",
			contractVersion: 1,
			name: "scrape",
			config: {
				method: "GET",
				URL: "http://169.254.169.254/latest/meta-data/",
			},
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues.map((issue) => issue.message)).toContain(
			"Private, loopback and link-local addresses are not allowed",
		);
	});

	it("accepts HTTP queryParams and refuses them on GET with bodyParams", () => {
		expect(
			connectorCreateSchema.safeParse({
				type: "http",
				contractVersion: 1,
				name: "search",
				config: {
					method: "GET",
					URL: "https://api.example.com/search",
					queryParams: ["q", "limit"],
				},
			}).success,
		).toBe(true);
		const refused = connectorCreateSchema.safeParse({
			type: "http",
			contractVersion: 1,
			name: "search",
			config: {
				method: "GET",
				URL: "https://api.example.com/search",
				bodyParams: ["title"],
			},
		});
		expect(refused.success).toBe(false);
	});

	it("accepts MCP and external database bodies", () => {
		expect(
			connectorCreateSchema.safeParse({
				type: "mcp",
				contractVersion: 1,
				name: "linear",
				config: { URL: "https://mcp.linear.example.com/mcp" },
			}).success,
		).toBe(true);
		expect(
			connectorCreateSchema.safeParse({
				type: "database",
				contractVersion: 1,
				name: "orders_db",
				credentials: { username: "reader", password: "db-secret-456" },
				config: {
					mode: "external",
					engine: "postgres",
					host: "db.example.com",
					database: "orders",
				},
			}).success,
		).toBe(true);
	});
});

describe("webhookSchema", () => {
	it("parses a webhook as the backend returns it", () => {
		const webhook = {
			id: "wh_1",
			owner_user_sso: "sso-user-a",
			target_type: "agent",
			target_agent_id: backendAgent.id,
			secret: "********",
			disabled: false,
			created_at: "2026-10-21T12:00:00Z",
		};
		expect(webhookSchema.parse(webhook)).toEqual(webhook);
	});

	it("defaults a missing target_type to agent", () => {
		const parsed = webhookSchema.parse({
			id: "wh_1",
			owner_user_sso: "sso-user-a",
			target_agent_id: backendAgent.id,
			secret: "********",
			disabled: false,
			created_at: "2026-10-21T12:00:00Z",
		});
		expect(parsed.target_type).toBe("agent");
	});
});

describe("chainSchema", () => {
	it("parses a chain with ordered steps and optional schedule", () => {
		const chain = {
			id: "chn_1",
			owner_user_sso: "sso-user-a",
			title: "Triage then summarize",
			schedule: { dayOfWeek: [1], timeOfDay: [540] },
			steps: [
				{ position: 0, agent_id: backendAgent.id, label: "Triage" },
				{ position: 1, agent_id: backendAgent.id, label: null },
			],
			created_at: "2026-10-21T12:00:00Z",
			updated_at: "2026-10-21T12:00:00Z",
		};
		expect(chainSchema.parse(chain)).toEqual(chain);
	});

	it("requires a title and at least one step on create", () => {
		const result = chainCreateSchema.safeParse({
			title: "   ",
			steps: [],
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		const messages = result.error.issues.map((issue) => issue.message);
		expect(messages).toContain("Name is required");
		expect(messages).toContain("Add at least one step");
	});
});

describe("chainRunSchema", () => {
	it("parses a running chain run without a final result", () => {
		const run = {
			id: "crun_1",
			chain_id: "chn_1",
			owner_user_sso: "sso-user-a",
			status: "running",
			input: "INC-1",
			trigger: "api",
			final_result: null,
			error_code: null,
			error_message: null,
			started_at: "2026-10-21T12:00:00Z",
			finished_at: null,
			created_at: "2026-10-21T12:00:00Z",
			updated_at: "2026-10-21T12:00:00Z",
		};
		expect(chainRunSchema.parse(run)).toEqual(run);
	});
});

describe("findingSchema", () => {
	it("parses a killed finding", () => {
		const finding = {
			id: "fnd_1",
			run_id: "run_1",
			agent_id: backendAgent.id,
			severity: "critical",
			rule: "exfiltration.untrusted_destination",
			message: "HTTP call targeted an untrusted destination",
			action: "killed",
			created_at: "2026-10-10T19:06:00Z",
		};
		expect(findingSchema.parse(finding)).toEqual(finding);
	});
});
