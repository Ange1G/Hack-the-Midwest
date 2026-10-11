import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { Toaster } from "#/components/ui/sonner";
import { API_BASE_URL } from "#/lib/api/client";
import { server } from "#/mocks/server";
import { createAgent, createRun, runToCompletion } from "#/mocks/state";
import { rogueAgentInput, safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentList } from "./agent-list";

async function tableRow(name: string): Promise<HTMLElement> {
	const table = await screen.findByRole("table");
	const row = (await within(table).findByRole("link", { name })).closest("tr");
	if (!row) throw new Error("expected a table row");
	return row;
}

describe("AgentList", () => {
	it("shows a loading state while agents are being fetched", async () => {
		signInAs();
		server.use(
			http.get(`${API_BASE_URL}/agents/:sso`, () => delay("infinite")),
		);
		renderWithProviders(<AgentList />);

		expect(await screen.findByRole("status")).toHaveTextContent(/loading/i);
	});

	it("shows an empty state with a link to create the first agent", async () => {
		signInAs();
		renderWithProviders(<AgentList />);

		expect(await screen.findByText(/no agents yet/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /create your first agent/i }),
		).toHaveAttribute("href", "/agents/new");
	});

	it("shows an error with a retry that recovers", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AgentList />);

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/sign in/i);

		signInAs();
		await user.click(screen.getByRole("button", { name: /try again/i }));

		expect(await screen.findByText(/no agents yet/i)).toBeInTheDocument();
	});

	it("lists agents with their HTTP calls, last run status, and a flagged marker", async () => {
		const owner = signInAs();
		const safe = createAgent(owner.user_sso, safeAgentInput);
		runToCompletion(createRun(safe));
		const rogue = createAgent(owner.user_sso, rogueAgentInput);
		runToCompletion(createRun(rogue));

		renderWithProviders(<AgentList />);

		await waitFor(() => {
			const table = screen.getByRole("table");
			const safeRow = within(table)
				.getByRole("link", { name: "Uptime checker" })
				.closest("tr");
			const rogueRow = within(table)
				.getByRole("link", { name: "Secret leaker" })
				.closest("tr");
			if (!safeRow || !rogueRow) throw new Error("expected table rows");

			expect(
				within(safeRow).getByRole("link", { name: "Uptime checker" }),
			).toHaveAttribute("href", `/agents/${safe.id}`);
			expect(within(safeRow).getByText("GET")).toBeInTheDocument();
			expect(within(safeRow).getByText("status")).toBeInTheDocument();
			expect(within(safeRow).getByText(/succeeded/i)).toBeInTheDocument();
			expect(within(safeRow).queryByText(/flagged/i)).not.toBeInTheDocument();

			expect(within(rogueRow).getByText("POST")).toBeInTheDocument();
			expect(within(rogueRow).getByText("leak")).toBeInTheDocument();
			expect(within(rogueRow).getByText(/failed/i)).toBeInTheDocument();
			expect(within(rogueRow).getByText(/flagged/i)).toBeInTheDocument();
		});
	});

	it("offers start, edit, and delete actions on an idle agent", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		renderWithProviders(<AgentList />);

		const row = await tableRow("Uptime checker");

		expect(within(row).getByRole("button", { name: "Start" })).toBeEnabled();
		expect(
			within(row).getByRole("link", { name: "Edit configuration" }),
		).toHaveAttribute("href", `/agents/${agent.id}/edit`);
		expect(within(row).getByRole("button", { name: "Delete" })).toBeEnabled();
		expect(
			within(row).queryByRole("button", { name: "Stop" }),
		).not.toBeInTheDocument();
	});

	it("starts a run from the table and then offers stop", async () => {
		const owner = signInAs();
		createAgent(owner.user_sso, safeAgentInput);
		const user = userEvent.setup();
		renderWithProviders(<AgentList />);

		const row = await tableRow("Uptime checker");

		await waitFor(() => {
			expect(within(row).getByText("GET")).toBeInTheDocument();
		});
		await user.click(within(row).getByRole("button", { name: "Start" }));

		await waitFor(() => {
			const updated = within(screen.getByRole("table"))
				.getByRole("link", { name: "Uptime checker" })
				.closest("tr");
			expect(updated).not.toBeNull();
			expect(
				within(updated as HTMLElement).getByRole("button", { name: "Stop" }),
			).toBeInTheDocument();
		});
	});

	it("shows stop instead of start while the last run is still active", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		createRun(agent);
		renderWithProviders(<AgentList />);

		const row = await tableRow("Uptime checker");

		expect(within(row).getByRole("button", { name: "Stop" })).toBeEnabled();
		expect(
			within(row).queryByRole("button", { name: "Start" }),
		).not.toBeInTheDocument();
	});

	it("opens the agent when its row is clicked", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const user = userEvent.setup();
		const { router } = renderWithProviders(<AgentList />);

		const row = await tableRow("Uptime checker");
		const createdCell = within(row).getAllByRole("cell")[3];
		if (!createdCell) throw new Error("expected a created cell");
		await user.click(createdCell);

		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/agents/${agent.id}`),
		);
	});

	it("deletes an idle agent and shows a success toast", async () => {
		const owner = signInAs();
		createAgent(owner.user_sso, safeAgentInput);
		const user = userEvent.setup();
		renderWithProviders(
			<>
				<AgentList />
				<Toaster />
			</>,
		);

		const row = await tableRow("Uptime checker");
		await user.click(within(row).getByRole("button", { name: "Delete" }));

		expect(await screen.findByText("Agent deleted")).toBeInTheDocument();
		// Row should no longer be in the table after list refresh
		await waitFor(() =>
			expect(
				screen.queryByRole("link", { name: "Uptime checker" }),
			).not.toBeInTheDocument(),
		);
	});

	it("confirms a started run and says stop is not available yet", async () => {
		const owner = signInAs();
		createAgent(owner.user_sso, safeAgentInput);
		const user = userEvent.setup();
		renderWithProviders(
			<>
				<AgentList />
				<Toaster />
			</>,
		);

		const row = await tableRow("Uptime checker");

		await user.click(within(row).getByRole("button", { name: "Start" }));
		expect(await screen.findByText("Run started")).toBeInTheDocument();

		await user.click(await within(row).findByRole("button", { name: "Stop" }));
		expect(
			await screen.findByText("Stopping a run is not available yet"),
		).toBeInTheDocument();
	});

	it("shows recently ran agents as cards that open their latest run", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const run = createRun(agent);
		runToCompletion(run);
		createAgent(owner.user_sso, {
			...safeAgentInput,
			agentTitle: "Never ran",
			configurations: { ...safeAgentInput.configurations, primitives: {} },
		});
		renderWithProviders(<AgentList />);

		const recent = await screen.findByRole("region", { name: "Recently ran" });
		const card = within(recent).getByRole("link", { name: "Uptime checker" });
		expect(card).toHaveAttribute("href", `/agents/${agent.id}?run=${run.id}`);
		expect(
			within(recent).queryByRole("link", { name: "Never ran" }),
		).not.toBeInTheDocument();
		expect(
			within(screen.getByRole("region", { name: "My agents" })).getByRole(
				"table",
			),
		).toBeInTheDocument();
	});

	it("lists flagged agents under needs attention instead of recently ran", async () => {
		const owner = signInAs();
		const rogue = createAgent(owner.user_sso, rogueAgentInput);
		runToCompletion(createRun(rogue));
		renderWithProviders(<AgentList />);

		const attention = await screen.findByRole("region", {
			name: "Needs attention",
		});
		await waitFor(() =>
			expect(
				within(attention).getByRole("link", { name: "Secret leaker" }),
			).toBeInTheDocument(),
		);
		expect(
			screen.queryByRole("region", { name: "Recently ran" }),
		).not.toBeInTheDocument();
	});

	it("runs an agent from its card and then offers stop", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		runToCompletion(createRun(agent));
		const user = userEvent.setup();
		renderWithProviders(
			<>
				<AgentList />
				<Toaster />
			</>,
		);

		const recent = await screen.findByRole("region", { name: "Recently ran" });
		await user.click(
			within(recent).getByRole("button", { name: "Run Uptime checker" }),
		);
		expect(await screen.findByText("Run started")).toBeInTheDocument();
		expect(
			await within(recent).findByRole("button", {
				name: "Stop Uptime checker",
			}),
		).toBeInTheDocument();
	});
});
