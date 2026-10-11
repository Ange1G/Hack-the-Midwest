import { describe, expect, it } from "vitest";
import { z } from "zod";
import { agentInputSchema, agentSchema, envelope, runSchema } from "./schemas";

// Exactly what POST/GET /api/v1/agents/{user_sso} return per the backend's
// tests: credentials come back masked, absent fields are omitted.
const backendAgent = {
	id: "0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e11",
	title: "Weekday GitHub digest",
	system_prompt: "Summarize yesterday's new issues.",
	configurations: {
		primitives: {
			list_issues: {
				contractVersion: 1,
				method: "GET",
				URL: "https://api.github.com/repos/acme/web/issues",
				options: { retries: 3, timeout: 10000 },
			},
			notify: {
				contractVersion: 1,
				method: "POST",
				URL: "https://hooks.example.com/notify",
				payload: { text: "digest ready" },
				xApiKey: "********",
				authorizationHeader: "********",
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
	status: "queued",
	output: null,
	error: null,
	created_at: "2026-10-10T19:05:00Z",
	started_at: null,
	finished_at: null,
};

const validInput = {
	agentTitle: "Weekday GitHub digest",
	systemPrompt: "Summarize yesterday's new issues.",
	configurations: {
		primitives: {
			list_issues: {
				contractVersion: 1,
				method: "GET",
				URL: "https://api.github.com/repos/acme/web/issues",
				xApiKey: "key-live-123",
				options: { retries: 3, timeout: 10000 },
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
	it("parses an agent as the backend returns it and defaults the run summary", () => {
		const parsed = agentSchema.parse(backendAgent);
		expect(parsed).toMatchObject({
			id: backendAgent.id,
			title: "Weekday GitHub digest",
			owner_user_sso: "sso-user-a",
		});
		expect(parsed.configurations.primitives.list_issues).toEqual(
			backendAgent.configurations.primitives.list_issues,
		);
		expect(parsed.configurations.primitives.notify?.xApiKey).toBe("********");
		expect(parsed.configurations.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
		expect(parsed.configurations.timeOfDay).toEqual([540]);
		expect(parsed.configurations.month).toBeUndefined();
		expect(parsed.last_run).toBeNull();
	});

	it("keeps the run summary when a response includes it", () => {
		const parsed = agentSchema.parse({
			...backendAgent,
			last_run: {
				id: "run_1",
				status: "succeeded",
				created_at: "2026-10-10T19:05:00Z",
			},
		});
		expect(parsed.last_run?.status).toBe("succeeded");
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

	it("requires identifier-style primitive names", () => {
		const messages = issueMessages({
			...validInput,
			configurations: {
				...validInput.configurations,
				primitives: {
					"List Issues": validInput.configurations.primitives.list_issues,
				},
			},
		});
		expect(messages.join(" ")).toMatch(
			/lowercase letters, numbers and underscores/i,
		);
	});

	it("refuses URLs the backend would refuse, with the backend's message", () => {
		const messages = issueMessages({
			...validInput,
			configurations: {
				...validInput.configurations,
				primitives: {
					scrape: {
						contractVersion: 1,
						method: "GET",
						URL: "http://169.254.169.254/latest/meta-data/",
					},
				},
			},
		});
		expect(messages).toContain(
			"Private, loopback and link-local addresses are not allowed",
		);
	});

	it("refuses a payload on a GET contract", () => {
		const messages = issueMessages({
			...validInput,
			configurations: {
				...validInput.configurations,
				primitives: {
					fetch: {
						contractVersion: 1,
						method: "GET",
						URL: "https://api.example.com/items",
						payload: { page: 1 },
					},
				},
			},
		});
		expect(messages.join(" ")).toMatch(
			/GET requests cannot include a payload/i,
		);
	});

	it("refuses the masked placeholder as a credential and bounds options", () => {
		const messages = issueMessages({
			...validInput,
			configurations: {
				...validInput.configurations,
				primitives: {
					notify: {
						contractVersion: 1,
						method: "POST",
						URL: "https://hooks.example.com/notify",
						xApiKey: "********",
						options: { retries: 9, timeout: 10 },
					},
				},
			},
		});
		expect(messages.join(" ")).toMatch(/actual credential/i);
		expect(messages.length).toBeGreaterThanOrEqual(3);
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
	it("parses a valid run", () => {
		expect(runSchema.parse(validRun)).toEqual(validRun);
	});

	it("rejects an unknown status", () => {
		expect(() =>
			runSchema.parse({ ...validRun, status: "exploded" }),
		).toThrow();
	});
});
