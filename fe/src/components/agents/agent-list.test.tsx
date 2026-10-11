import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { API_BASE_URL } from "#/lib/api/client";
import { server } from "#/mocks/server";
import { createAgent, createRun, runToCompletion } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { actAs } from "#/test/identity";
import { renderWithProviders } from "#/test/render";
import { AgentList } from "./agent-list";

const agentsUrl = `${API_BASE_URL}/agents/:sso`;

// The table row for an agent, looked up fresh because rows re-render once
// the connectors and executions queries settle.
function rowFor(name: string): HTMLElement {
	const row = screen.getByRole("link", { name }).closest("tr");
	if (!row) throw new Error(`expected a table row for ${name}`);
	return row;
}

describe("AgentList", () => {
	it("shows a loading state while agents are being fetched", async () => {
		actAs();
		server.use(http.get(agentsUrl, () => delay("infinite")));
		renderWithProviders(<AgentList />);

		const status = await screen.findByRole("status");
		expect(status).toHaveTextContent(/loading/i);
		// A sketch of the table, so the layout does not jump when data arrives.
		expect(status).toHaveAttribute("data-layout", "table");
	});

	it("shows an empty state with a link to create the first agent", async () => {
		actAs();
		renderWithProviders(<AgentList />);

		expect(await screen.findByText(/no agents yet/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /create your first agent/i }),
		).toHaveAttribute("href", "/agents/new");
	});

	it("shows an error with a retry that recovers", async () => {
		actAs();
		server.use(
			http.get(
				agentsUrl,
				() =>
					HttpResponse.json(
						{
							data: null,
							error: {
								code: "internal_error",
								message: "Database unavailable",
								details: null,
							},
							metadata: { request_id: "req_1" },
							pagination: null,
						},
						{ status: 500 },
					),
				{ once: true },
			),
		);
		const user = userEvent.setup();
		renderWithProviders(<AgentList />);

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/database unavailable/i);

		await user.click(screen.getByRole("button", { name: /try again/i }));

		expect(await screen.findByText(/no agents yet/i)).toBeInTheDocument();
	});

	it("lists agents with their HTTP calls and last run status", async () => {
		const owner = actAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		runToCompletion(createRun(agent));

		renderWithProviders(<AgentList />);

		await screen.findByRole("link", { name: "Uptime checker" });
		await waitFor(() => {
			const row = rowFor("Uptime checker");
			expect(
				within(row).getByRole("link", { name: "Uptime checker" }),
			).toHaveAttribute("href", `/agents/${agent.id}`);
			// The HTTP chips resolve once the connectors have loaded.
			expect(within(row).getByText("GET")).toBeInTheDocument();
			expect(within(row).getByText("status")).toBeInTheDocument();
			expect(within(row).getByText(/succeeded/i)).toBeInTheDocument();
		});
	});

	it("offers start, edit, view, and delete actions on an idle agent", async () => {
		const owner = actAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		renderWithProviders(<AgentList />);

		await screen.findByRole("link", { name: "Uptime checker" });
		const row = rowFor("Uptime checker");

		expect(within(row).getByRole("button", { name: "Start" })).toBeEnabled();
		expect(
			within(row).getByRole("link", { name: "Edit configuration" }),
		).toHaveAttribute("href", `/agents/${agent.id}/edit`);
		expect(
			within(row).getByRole("link", { name: "View details" }),
		).toHaveAttribute("href", `/agents/${agent.id}`);
		expect(within(row).getByRole("button", { name: "Delete" })).toBeEnabled();
		expect(
			within(row).queryByRole("button", { name: "Stop" }),
		).not.toBeInTheDocument();
	});

	it("starts a run from the table and then offers stop", async () => {
		const owner = actAs();
		createAgent(owner.user_sso, safeAgentInput);
		const user = userEvent.setup();
		renderWithProviders(<AgentList />);

		await screen.findByRole("link", { name: "Uptime checker" });
		await waitFor(() => {
			expect(
				within(rowFor("Uptime checker")).getByText("GET"),
			).toBeInTheDocument();
		});

		await user.click(
			within(rowFor("Uptime checker")).getByRole("button", { name: "Start" }),
		);

		await waitFor(() => {
			expect(
				within(rowFor("Uptime checker")).getByRole("button", { name: "Stop" }),
			).toBeInTheDocument();
		});
	});

	it("shows stop instead of start while the last run is still active", async () => {
		const owner = actAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		createRun(agent);
		renderWithProviders(<AgentList />);

		await screen.findByRole("link", { name: "Uptime checker" });
		const row = rowFor("Uptime checker");

		expect(within(row).getByRole("button", { name: "Stop" })).toBeEnabled();
		expect(
			within(row).queryByRole("button", { name: "Start" }),
		).not.toBeInTheDocument();
	});
});
