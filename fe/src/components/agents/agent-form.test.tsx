import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "#/lib/api/client";
import { server } from "#/mocks/server";
import { createAgent, mockState } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentForm } from "./agent-form";

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
	await user.type(
		await screen.findByLabelText(/^name$/i),
		"Weekday GitHub digest",
	);
	await user.type(
		screen.getByLabelText(/^instructions$/i),
		"Summarize yesterday's new issues.",
	);
}

async function addTool(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: /add tool/i }));
	return within(screen.getByRole("group", { name: /tool 1/i }));
}

// The method, tool type and month controls are shadcn (Radix) Selects: open
// the trigger, then pick the option from the listbox.
async function choose(
	user: ReturnType<typeof userEvent.setup>,
	trigger: HTMLElement,
	option: RegExp | string,
) {
	await user.click(trigger);
	await user.click(await screen.findByRole("option", { name: option }));
}

describe("AgentForm", () => {
	it("adds an HTTP tool by default, showing the payload only for POST", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<AgentForm onCreated={vi.fn()} />);
		await screen.findByLabelText(/^name$/i);

		expect(screen.queryByLabelText(/^url$/i)).not.toBeInTheDocument();
		const call = await addTool(user);

		expect(call.getByLabelText(/tool name/i)).toBeInTheDocument();
		expect(call.getByLabelText(/^method$/i)).toHaveTextContent("GET");
		expect(call.getByLabelText(/^url$/i)).toBeInTheDocument();
		expect(call.getByLabelText(/api key/i)).toBeInTheDocument();
		expect(call.getByLabelText(/authorization header/i)).toBeInTheDocument();
		expect(call.queryByLabelText(/payload/i)).not.toBeInTheDocument();

		await choose(user, call.getByLabelText(/^method$/i), "POST");
		expect(call.getByLabelText(/payload/i)).toBeInTheDocument();
	});

	it("requires a name and instructions before calling the API", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		renderWithProviders(<AgentForm onCreated={onCreated} />);

		await user.click(
			await screen.findByRole("button", { name: /create agent/i }),
		);

		expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
		expect(screen.getByText(/instructions are required/i)).toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();
		expect(mockState.agents).toHaveLength(0);
	});

	it("refuses a call to the cloud metadata endpoint before calling the API", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		renderWithProviders(<AgentForm onCreated={onCreated} />);
		await fillBasics(user);
		const call = await addTool(user);
		await user.type(call.getByLabelText(/tool name/i), "scrape");
		await user.type(
			call.getByLabelText(/^url$/i),
			"http://169.254.169.254/latest/meta-data/",
		);

		await user.click(screen.getByRole("button", { name: /create agent/i }));

		expect(
			await screen.findByText(
				/private, loopback and link-local addresses are not allowed/i,
			),
		).toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();
		expect(mockState.agents).toHaveLength(0);
	});

	it("requires a tool name and URL, and a valid JSON payload", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<AgentForm onCreated={vi.fn()} />);
		await fillBasics(user);
		const call = await addTool(user);
		await choose(user, call.getByLabelText(/^method$/i), "POST");
		// user-event treats "{" as a key descriptor; "{{" types a literal brace.
		await user.type(call.getByLabelText(/payload/i), "{{not json");

		await user.click(screen.getByRole("button", { name: /create agent/i }));

		expect(
			await screen.findByText(/tool name is required/i),
		).toBeInTheDocument();
		expect(screen.getByText(/url is required/i)).toBeInTheDocument();
		expect(screen.getByText(/payload must be valid json/i)).toBeInTheDocument();
		expect(mockState.agents).toHaveLength(0);
	});

	it("creates the agent with the team-spec body and reports the masked result", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		let sent: unknown;
		server.events.on("request:start", async ({ request }) => {
			if (request.method === "POST" && request.url.includes("/agents/")) {
				sent = await request.clone().json();
			}
		});
		renderWithProviders(<AgentForm onCreated={onCreated} />);
		await fillBasics(user);
		const call = await addTool(user);
		await user.type(call.getByLabelText(/tool name/i), "list_issues");
		await user.type(
			call.getByLabelText(/^url$/i),
			"https://api.github.com/repos/acme/web/issues",
		);
		await user.type(call.getByLabelText(/api key/i), "key-live-123");
		await user.clear(call.getByLabelText(/retries/i));
		await user.type(call.getByLabelText(/retries/i), "3");
		await user.clear(call.getByLabelText(/timeout/i));
		await user.type(call.getByLabelText(/timeout/i), "10000");
		for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
			await user.click(screen.getByRole("checkbox", { name: day }));
		}
		await user.type(screen.getByLabelText(/times/i), "09:00");

		await user.click(screen.getByRole("button", { name: /create agent/i }));

		await waitFor(() =>
			expect(onCreated).toHaveBeenCalledWith(
				expect.objectContaining({ title: "Weekday GitHub digest" }),
			),
		);
		expect(sent).toEqual({
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
		});
		const created = onCreated.mock.calls[0]?.[0];
		expect(created.configurations.primitives.list_issues.xApiKey).toBe(
			"********",
		);
	});

	it("shows a server-side configuration error on the tool it belongs to", async () => {
		signInAs();
		server.use(
			http.post(`${API_BASE_URL}/agents/:sso`, () =>
				HttpResponse.json(
					{
						data: null,
						error: {
							code: "invalid_configuration",
							message: "Agent configuration is invalid",
							details: {
								errors: [
									{
										field: "configurations.primitives.list_issues.URL",
										message: "Internal hostnames are not allowed",
									},
								],
							},
						},
						metadata: { request_id: "req_1" },
						pagination: null,
					},
					{ status: 422 },
				),
			),
		);
		const user = userEvent.setup();
		const onCreated = vi.fn();
		renderWithProviders(<AgentForm onCreated={onCreated} />);
		await fillBasics(user);
		const call = await addTool(user);
		await user.type(call.getByLabelText(/tool name/i), "list_issues");
		await user.type(call.getByLabelText(/^url$/i), "https://api.example.com/x");

		await user.click(screen.getByRole("button", { name: /create agent/i }));

		expect(
			await call.findByText(/internal hostnames are not allowed/i),
		).toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();
	});

	it("prefills a read-only edit shell and disables saving", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, {
			...safeAgentInput,
			configurations: {
				...safeAgentInput.configurations,
				dayOfWeek: [1, 3],
				timeOfDay: [540],
			},
		});
		renderWithProviders(<AgentForm agent={agent} readOnly />);

		expect(await screen.findByLabelText(/^name$/i)).toHaveValue(
			"Uptime checker",
		);
		expect(screen.getByLabelText(/^name$/i)).toBeDisabled();
		expect(screen.getByLabelText(/^instructions$/i)).toBeDisabled();
		expect(screen.getByLabelText(/tool name/i)).toHaveValue("status");
		expect(screen.getByLabelText(/tool name/i)).toBeDisabled();
		expect(screen.getByLabelText(/tool type/i)).toHaveTextContent(
			"HTTP request",
		);
		expect(screen.queryByRole("button", { name: /add tool/i })).toBeNull();
		expect(
			screen.getByRole("button", { name: /save changes/i }),
		).toBeDisabled();
		expect(
			screen.getByText(/saving changes is not available yet/i),
		).toBeInTheDocument();
	});
	it("lists the HTTP methods the API does not accept yet as disabled", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<AgentForm onCreated={vi.fn()} />);
		await screen.findByLabelText(/^name$/i);
		const call = await addTool(user);

		await user.click(call.getByLabelText(/^method$/i));

		for (const method of ["PUT", "PATCH", "DELETE"]) {
			expect(
				await screen.findByRole("option", { name: new RegExp(method) }),
			).toHaveAttribute("aria-disabled", "true");
		}
		expect(screen.getByRole("option", { name: "POST" })).not.toHaveAttribute(
			"aria-disabled",
		);
	});

	it("switches a tool to an MCP server, keeping the shared fields", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<AgentForm onCreated={vi.fn()} />);
		await screen.findByLabelText(/^name$/i);
		const tool = await addTool(user);
		await user.type(tool.getByLabelText(/tool name/i), "tracker");
		await user.type(tool.getByLabelText(/^url$/i), "https://mcp.example.com");

		await choose(user, tool.getByLabelText(/tool type/i), "MCP server");

		expect(tool.getByLabelText(/tool name/i)).toHaveValue("tracker");
		expect(tool.getByLabelText(/server url/i)).toHaveValue(
			"https://mcp.example.com",
		);
		expect(tool.getByLabelText(/description/i)).toBeInTheDocument();
		expect(tool.getByLabelText(/api key/i)).toBeInTheDocument();
		expect(tool.getByLabelText(/authorization header/i)).toBeInTheDocument();
		expect(tool.queryByLabelText(/^method$/i)).not.toBeInTheDocument();
		expect(tool.queryByLabelText(/payload/i)).not.toBeInTheDocument();
		expect(tool.getByLabelText(/retries/i)).toHaveAccessibleDescription(
			/connecting to the server only/i,
		);
		expect(tool.getByLabelText(/timeout/i)).toHaveAccessibleDescription(
			/each tool call/i,
		);
	});

	it("validates an MCP server and refuses to send it until the API supports it", async () => {
		signInAs();
		const user = userEvent.setup();
		const onCreated = vi.fn();
		let posted = false;
		server.events.on("request:start", ({ request }) => {
			if (request.method === "POST") posted = true;
		});
		renderWithProviders(<AgentForm onCreated={onCreated} />);
		await fillBasics(user);
		const tool = await addTool(user);
		await choose(user, tool.getByLabelText(/tool type/i), "MCP server");
		await user.type(tool.getByLabelText(/tool name/i), "tracker");
		await user.type(
			tool.getByLabelText(/server url/i),
			"http://169.254.169.254/mcp",
		);
		await user.type(tool.getByLabelText(/retries/i), "9");

		await user.click(screen.getByRole("button", { name: /create agent/i }));

		expect(
			await tool.findByText(
				/private, loopback and link-local addresses are not allowed/i,
			),
		).toBeInTheDocument();
		expect(
			tool.getByText(/retries must be between 0 and 5/i),
		).toBeInTheDocument();
		expect(
			tool.getByText(/mcp servers cannot be saved yet/i),
		).toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();
		expect(posted).toBe(false);
		expect(mockState.agents).toHaveLength(0);
	});

	it("never copies a stored credential into the edit form", async () => {
		const owner = signInAs();
		const status = safeAgentInput.configurations.primitives.status;
		if (!status) throw new Error("fixture is missing the status call");
		const agent = createAgent(owner.user_sso, {
			...safeAgentInput,
			configurations: {
				...safeAgentInput.configurations,
				primitives: { status: { ...status, xApiKey: "key-live-123" } },
			},
		});
		renderWithProviders(<AgentForm agent={agent} readOnly />);

		const apiKey = await screen.findByLabelText(/api key/i);
		expect(apiKey).toHaveValue("");
		expect(apiKey).toHaveAccessibleDescription(/a value is stored and hidden/i);
		expect(screen.getByLabelText(/authorization header/i)).toHaveValue("");
		expect(
			screen.getByLabelText(/authorization header/i),
		).not.toHaveAccessibleDescription(/stored/i);
		expect(document.body.innerHTML).not.toContain("********");
	});
});
