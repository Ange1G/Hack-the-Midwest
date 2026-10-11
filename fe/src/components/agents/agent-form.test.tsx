import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { server } from "#/mocks/server";
import { createConnector, mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { chooseOption } from "#/test/select";
import { signInAs } from "#/test/session";
import { AgentForm } from "./agent-form";

function seedHttpConnector(owner: string) {
	return createConnector(owner, {
		type: "http",
		contractVersion: 1,
		name: "status",
		config: {
			method: "GET",
			URL: "https://status.example.com/api/v2/status.json",
		},
	});
}

describe("AgentForm", () => {
	it("requires a name and instructions before calling the API", async () => {
		signInAs();
		const user = userEvent.setup();
		const onSaved = vi.fn();
		renderWithProviders(<AgentForm onSaved={onSaved} />);

		await user.click(
			await screen.findByRole("button", { name: /create agent/i }),
		);

		expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
		expect(screen.getByText(/instructions are required/i)).toBeInTheDocument();
		expect(onSaved).not.toHaveBeenCalled();
		expect(mockState.agents).toHaveLength(0);
	});

	it("creates an agent that references an existing connector", async () => {
		const owner = signInAs();
		const connector = seedHttpConnector(owner.user_sso);
		const user = userEvent.setup();
		const onSaved = vi.fn();
		let sentAgent: unknown;
		server.events.on("request:start", async ({ request }) => {
			if (request.method !== "POST" || !request.url.includes("/agents/")) {
				return;
			}
			sentAgent = await request.clone().json();
		});
		renderWithProviders(<AgentForm onSaved={onSaved} />);

		await user.type(
			await screen.findByLabelText(/^name$/i),
			"Weekday GitHub digest",
		);
		await user.type(
			screen.getByLabelText(/^instructions$/i),
			"Summarize yesterday's new issues.",
		);
		await user.click(screen.getByRole("button", { name: /attach connector/i }));
		await chooseOption(
			user,
			screen.getByLabelText(/^connector$/i),
			/status \(http\)/i,
		);
		for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
			await user.click(screen.getByRole("checkbox", { name: day }));
		}
		await user.type(screen.getByLabelText(/times/i), "09:00");

		await user.click(screen.getByRole("button", { name: /create agent/i }));

		await waitFor(() =>
			expect(onSaved).toHaveBeenCalledWith(
				expect.objectContaining({ title: "Weekday GitHub digest" }),
			),
		);
		expect(sentAgent).toEqual({
			agentTitle: "Weekday GitHub digest",
			systemPrompt: "Summarize yesterday's new issues.",
			configurations: {
				primitives: { [connector.id]: {} },
				dayOfWeek: [1, 2, 3, 4, 5],
				timeOfDay: [540],
			},
		});
	});

	it("creates an HTTP connector inline, then the agent that references it", async () => {
		signInAs();
		const user = userEvent.setup();
		const onSaved = vi.fn();
		let sentConnector: unknown;
		let sentAgent: unknown;
		server.events.on("request:start", async ({ request }) => {
			if (request.method !== "POST") return;
			if (request.url.includes("/connectors/")) {
				sentConnector = await request.clone().json();
			}
			if (request.url.includes("/agents/")) {
				sentAgent = await request.clone().json();
			}
		});
		renderWithProviders(<AgentForm onSaved={onSaved} />);
		await user.type(
			await screen.findByLabelText(/^name$/i),
			"Weekday GitHub digest",
		);
		await user.type(
			screen.getByLabelText(/^instructions$/i),
			"Summarize yesterday's new issues.",
		);
		await user.click(screen.getByRole("button", { name: /create connector/i }));
		const slot = within(screen.getByRole("group", { name: /connector 1/i }));
		await user.type(slot.getByLabelText(/^name$/i), "list_issues");
		await user.type(
			slot.getByLabelText(/^url$/i),
			"https://api.github.com/repos/acme/web/issues",
		);
		await user.click(screen.getByRole("button", { name: /create agent/i }));

		await waitFor(() =>
			expect(onSaved).toHaveBeenCalledWith(
				expect.objectContaining({ title: "Weekday GitHub digest" }),
			),
		);
		expect(sentConnector).toEqual({
			type: "http",
			contractVersion: 1,
			name: "list_issues",
			config: {
				method: "GET",
				URL: "https://api.github.com/repos/acme/web/issues",
			},
		});
		const primitives = (
			sentAgent as { configurations: { primitives: Record<string, unknown> } }
		).configurations.primitives;
		expect(Object.values(primitives)).toEqual([{}]);
		expect(mockState.connectors).toHaveLength(1);
	});

	it("refuses an unsafe inline HTTP URL before creating the agent", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<AgentForm onSaved={vi.fn()} />);
		await user.type(
			await screen.findByLabelText(/^name$/i),
			"Metadata scraper",
		);
		await user.type(
			screen.getByLabelText(/^instructions$/i),
			"Fetch the instance metadata.",
		);
		await user.click(screen.getByRole("button", { name: /create connector/i }));
		const slot = within(screen.getByRole("group", { name: /connector 1/i }));
		await user.type(slot.getByLabelText(/^name$/i), "scrape");
		await user.type(
			slot.getByLabelText(/^url$/i),
			"http://169.254.169.254/latest/meta-data/",
		);
		await user.click(screen.getByRole("button", { name: /create agent/i }));
		expect(
			await slot.findByText(
				/private, loopback and link-local addresses are not allowed/i,
			),
		).toBeInTheDocument();
		expect(mockState.agents).toHaveLength(0);
		expect(mockState.connectors).toHaveLength(0);
	});

	it("requires allowed tools when attaching an MCP connector", async () => {
		const owner = signInAs();
		createConnector(owner.user_sso, {
			type: "mcp",
			contractVersion: 1,
			name: "linear",
			config: { URL: "https://mcp.linear.example.com/mcp" },
		});
		const user = userEvent.setup();
		renderWithProviders(<AgentForm onSaved={vi.fn()} />);
		await user.type(await screen.findByLabelText(/^name$/i), "Triage");
		await user.type(
			screen.getByLabelText(/^instructions$/i),
			"Triage tickets.",
		);
		await user.click(screen.getByRole("button", { name: /attach connector/i }));
		await chooseOption(
			user,
			screen.getByLabelText(/^connector$/i),
			/linear \(mcp\)/i,
		);
		await user.click(screen.getByRole("button", { name: /create agent/i }));
		expect(
			await screen.findByText(/need at least one allowed tool/i),
		).toBeInTheDocument();
		expect(mockState.agents).toHaveLength(0);
	});
});
