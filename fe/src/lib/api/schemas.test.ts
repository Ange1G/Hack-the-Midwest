import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	agentInputSchema,
	agentSchema,
	envelope,
	findingSchema,
	runSchema,
} from "./schemas";

// Exactly what GET /api/v1/agents/{user_sso} returns per the backend's tests.
const backendAgent = {
	id: "0b1f1c6a-4f4e-4b1b-9d2a-1c9c3b2d7e11",
	title: "Uptime checker",
	system_prompt: "Check the status page every hour.",
	configurations: {
		tools: [
			{ kind: "http.get", config: { url: "https://status.example.com" } },
		],
	},
	schedule_month: null,
	schedule_day: null,
	schedule_time: null,
	owner_user_sso: "angel",
	created_at: "2026-10-10T19:00:00+00:00",
	updated_at: "2026-10-10T19:00:00+00:00",
};

const validRun = {
	id: "run_1",
	agent_id: backendAgent.id,
	status: "queued",
	output: null,
	error: null,
	finding_id: null,
	created_at: "2026-10-10T19:05:00Z",
	started_at: null,
	finished_at: null,
};

describe("agentSchema", () => {
	it("parses an agent as the backend returns it and defaults fields it does not send yet", () => {
		const parsed = agentSchema.parse(backendAgent);
		expect(parsed).toMatchObject({
			id: backendAgent.id,
			title: "Uptime checker",
			system_prompt: "Check the status page every hour.",
			owner_user_sso: "angel",
			schedule_time: null,
		});
		expect(parsed.configurations.tools).toEqual(
			backendAgent.configurations.tools,
		);
		expect(parsed.flagged).toBe(false);
		expect(parsed.last_run).toBeNull();
	});

	it("keeps the run summary and flag when a response includes them", () => {
		const parsed = agentSchema.parse({
			...backendAgent,
			flagged: true,
			last_run: {
				id: "run_1",
				status: "killed",
				created_at: "2026-10-10T19:05:00Z",
			},
		});
		expect(parsed.flagged).toBe(true);
		expect(parsed.last_run?.status).toBe("killed");
	});

	it("tolerates configurations that do not follow the tools convention", () => {
		expect(
			agentSchema.parse({
				...backendAgent,
				configurations: { tools: ["HTTP.GET"] },
			}).configurations.tools,
		).toEqual([]);
		expect(
			agentSchema.parse({ ...backendAgent, configurations: {} }).configurations
				.tools,
		).toEqual([]);
		expect(
			agentSchema.parse({
				...backendAgent,
				configurations: { tools: [{ kind: "shell.exec", config: {} }] },
			}).configurations.tools,
		).toEqual([]);
	});

	it("never exposes credentials from a response", () => {
		const parsed = agentSchema.parse({
			...backendAgent,
			configurations: {
				tools: [
					{
						kind: "http.get",
						config: { url: "https://status.example.com" },
						credentials: { token: "secret" },
					},
				],
			},
		});
		expect(parsed.configurations.tools[0]).not.toHaveProperty("credentials");
	});
});

describe("agentInputSchema", () => {
	it("requires a title and a system prompt", () => {
		const result = agentInputSchema.safeParse({
			title: "   ",
			system_prompt: "",
			configurations: { tools: [] },
		});
		expect(result.success).toBe(false);
	});

	it("accepts write-only credentials outside configurations", () => {
		const result = agentInputSchema.safeParse({
			title: "Ticket triage",
			system_prompt: "Triage new tickets.",
			configurations: {
				tools: [{ kind: "mcp", config: { url: "https://mcp.devrev.ai" } }],
			},
			credentials: [{ tool: "mcp", values: { token: "t" } }],
		});
		expect(result.success).toBe(true);
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
				code: "forbidden",
				message: "You may not access agents for another user",
				details: null,
			},
			metadata: { request_id: "req_2" },
			pagination: null,
		});
		expect(parsed.data).toBeNull();
		expect(parsed.error?.code).toBe("forbidden");
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

describe("findingSchema", () => {
	it("parses a killed finding", () => {
		const finding = {
			id: "fnd_1",
			run_id: "run_1",
			agent_id: backendAgent.id,
			severity: "critical",
			rule: "ssrf.metadata_endpoint",
			message: "HTTP tool targeted 169.254.169.254",
			action: "killed",
			created_at: "2026-10-10T19:06:00Z",
		};
		expect(findingSchema.parse(finding)).toEqual(finding);
	});
});
