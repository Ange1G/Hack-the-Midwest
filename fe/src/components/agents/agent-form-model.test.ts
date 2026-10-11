import { describe, expect, it } from "vitest";
import { createAgent } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import {
	buildInput,
	buildMcpTool,
	draftsFromAgent,
	emptySchedule,
	emptyTool,
	errorsFromServer,
	MCP_NOT_SUPPORTED_MESSAGE,
	type ToolDraft,
} from "./agent-form-model";

const basics = { name: "Digest", instructions: "Summarise the issues." };

const tool = (patch: Partial<ToolDraft>): ToolDraft => ({
	...emptyTool(),
	...patch,
});

describe("buildInput", () => {
	it("sends HTTP tools in the flat contract the agents API accepts", () => {
		const { input, errors } = buildInput(
			basics,
			[
				tool({
					name: "notify",
					method: "POST",
					url: "https://hooks.example.com/x",
					payload: '{"text": "done"}',
					authorizationHeader: "Bearer abc",
					retries: "2",
				}),
			],
			emptySchedule(),
		);

		expect(errors).toEqual({});
		expect(input.configurations.primitives).toEqual({
			notify: {
				contractVersion: 1,
				method: "POST",
				URL: "https://hooks.example.com/x",
				payload: { text: "done" },
				authorizationHeader: "Bearer abc",
				options: { retries: 2 },
			},
		});
	});

	it("validates an MCP tool but never sends it", () => {
		const { input, errors } = buildInput(
			basics,
			[tool({ type: "mcp", name: "tracker", url: "https://mcp.example.com" })],
			emptySchedule(),
		);

		expect(input.configurations.primitives).toEqual({});
		expect(errors).toEqual({ "tools.0.type": MCP_NOT_SUPPORTED_MESSAGE });
	});

	it("maps MCP contract problems onto the fields that caused them", () => {
		const { errors } = buildInput(
			basics,
			[
				tool({
					type: "mcp",
					name: "Tracker",
					url: "",
					description: "x".repeat(1_001),
					xApiKey: "********",
					timeout: "60001",
				}),
			],
			emptySchedule(),
		);

		expect(errors["tools.0.name"]).toMatch(/lowercase letters/i);
		expect(errors["tools.0.url"]).toBe("Server URL is required");
		expect(errors["tools.0.description"]).toMatch(/under 1000 characters/);
		expect(errors["tools.0.xApiKey"]).toMatch(/not the placeholder/);
		expect(errors["tools.0.timeout"]).toMatch(/between 100 and 60000/);
	});

	it("requires tool names to be unique across tool types", () => {
		const { errors } = buildInput(
			basics,
			[
				tool({ name: "shared", url: "https://api.example.com" }),
				tool({ type: "mcp", name: "shared", url: "https://mcp.example.com" }),
			],
			emptySchedule(),
		);

		expect(errors["tools.1.name"]).toBe("Tool names must be unique");
	});

	it("places server errors on the tool whose primitive they name", () => {
		const { primitiveIndex } = buildInput(
			basics,
			[
				tool({ type: "mcp", name: "tracker", url: "https://mcp.example.com" }),
				tool({ name: "status", url: "https://status.example.com" }),
			],
			emptySchedule(),
		);

		expect(
			errorsFromServer(
				{ "configurations.primitives.status.URL": "Internal hostnames" },
				primitiveIndex,
			),
		).toEqual({ "tools.1.url": "Internal hostnames" });
	});
});

describe("buildMcpTool", () => {
	it("builds the agreed MCP contract, omitting empty optional parts", () => {
		expect(
			buildMcpTool(
				tool({
					type: "mcp",
					name: "tracker",
					url: " https://mcp.example.com/mcp ",
					description: "  Issue tracker  ",
					xApiKey: "key-1",
				}),
				{ retries: 1 },
			),
		).toEqual({
			type: "mcp",
			contractVersion: 1,
			name: "tracker",
			description: "Issue tracker",
			options: { retries: 1 },
			credentials: { xApiKey: "key-1" },
			config: { URL: "https://mcp.example.com/mcp" },
		});
	});
});

describe("draftsFromAgent", () => {
	it("marks stored credentials without copying them into the draft", () => {
		const status = safeAgentInput.configurations.primitives.status;
		if (!status) throw new Error("fixture is missing the status call");
		const agent = createAgent("owner", {
			...safeAgentInput,
			configurations: {
				...safeAgentInput.configurations,
				primitives: { status: { ...status, authorizationHeader: "Bearer x" } },
			},
		});

		const [draft] = draftsFromAgent(agent).tools;

		expect(draft).toMatchObject({
			type: "http",
			name: "status",
			xApiKey: "",
			authorizationHeader: "",
			storedCredentials: { xApiKey: false, authorizationHeader: true },
		});
	});
});
