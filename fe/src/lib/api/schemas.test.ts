import { describe, expect, it } from "vitest";
import {
	agentInputSchema,
	agentSchema,
	apiErrorBodySchema,
	collection,
	findingSchema,
	runSchema,
} from "./schemas";

const validAgent = {
	id: "agt_1",
	name: "Uptime checker",
	instructions: "Check the status page every hour.",
	tools: [{ kind: "http.get", config: { url: "https://status.example.com" } }],
	status: "active",
	flagged: false,
	last_run: null,
	created_at: "2026-10-10T19:00:00Z",
	updated_at: "2026-10-10T19:00:00Z",
};

const validRun = {
	id: "run_1",
	agent_id: "agt_1",
	status: "queued",
	output: null,
	error: null,
	finding_id: null,
	created_at: "2026-10-10T19:05:00Z",
	started_at: null,
	finished_at: null,
};

describe("agentSchema", () => {
	it("parses a valid agent", () => {
		expect(agentSchema.parse(validAgent)).toEqual(validAgent);
	});

	it("drops credentials if a response ever includes them", () => {
		const leaky = {
			...validAgent,
			tools: [{ ...validAgent.tools[0], credentials: { token: "secret" } }],
		};
		const parsed = agentSchema.parse(leaky);
		expect(parsed.tools[0]).not.toHaveProperty("credentials");
	});

	it("rejects an unknown tool kind", () => {
		const bad = { ...validAgent, tools: [{ kind: "shell.exec", config: {} }] };
		expect(() => agentSchema.parse(bad)).toThrow();
	});
});

describe("agentInputSchema", () => {
	it("requires a non-blank name and instructions", () => {
		const result = agentInputSchema.safeParse({
			name: "   ",
			instructions: "",
			tools: [],
		});
		expect(result.success).toBe(false);
	});

	it("accepts write-only credentials on a tool", () => {
		const result = agentInputSchema.safeParse({
			name: "Ticket triage",
			instructions: "Triage new tickets.",
			tools: [
				{
					kind: "mcp",
					config: { url: "https://mcp.devrev.ai" },
					credentials: { token: "t" },
				},
			],
		});
		expect(result.success).toBe(true);
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
			agent_id: "agt_1",
			severity: "critical",
			rule: "ssrf.metadata_endpoint",
			message: "HTTP tool targeted 169.254.169.254",
			action: "killed",
			created_at: "2026-10-10T19:06:00Z",
		};
		expect(findingSchema.parse(finding)).toEqual(finding);
	});
});

describe("collection", () => {
	it("wraps an item schema in an items array", () => {
		const parsed = collection(runSchema).parse({ items: [validRun] });
		expect(parsed.items).toHaveLength(1);
	});
});

describe("apiErrorBodySchema", () => {
	it("parses the error envelope with optional field errors", () => {
		const body = {
			error: {
				code: "validation_error",
				message: "Invalid input",
				fields: { name: "Required" },
			},
		};
		expect(apiErrorBodySchema.parse(body)).toEqual(body);
	});
});
