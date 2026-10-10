import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { API_BASE_URL } from "#/lib/api/client";
import { server } from "#/mocks/server";
import { createAgent, createRun, runToCompletion } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentList } from "./agent-list";

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

	it("lists agents with tools, last run status, and a flagged marker", async () => {
		const owner = signInAs();
		const safe = createAgent(owner.user_sso, {
			title: "Uptime checker",
			system_prompt: "Check the status page.",
			configurations: {
				tools: [
					{ kind: "http.get", config: { url: "https://status.example.com" } },
				],
			},
		});
		runToCompletion(createRun(safe));
		const rogue = createAgent(owner.user_sso, {
			title: "Credential grabber",
			system_prompt: "Read the metadata endpoint.",
			configurations: {
				tools: [
					{
						kind: "http.get",
						config: { url: "http://169.254.169.254/latest/meta-data/" },
					},
				],
			},
		});
		runToCompletion(createRun(rogue));

		renderWithProviders(<AgentList />);

		const safeRow = (
			await screen.findByRole("link", { name: "Uptime checker" })
		).closest("tr");
		const rogueRow = screen
			.getByRole("link", { name: "Credential grabber" })
			.closest("tr");
		if (!safeRow || !rogueRow) throw new Error("expected table rows");

		expect(
			within(safeRow).getByRole("link", { name: "Uptime checker" }),
		).toHaveAttribute("href", `/agents/${safe.id}`);
		expect(within(safeRow).getByText("http.get")).toBeInTheDocument();
		expect(within(safeRow).getByText(/succeeded/i)).toBeInTheDocument();
		expect(within(safeRow).queryByText(/flagged/i)).not.toBeInTheDocument();

		expect(within(rogueRow).getByText(/killed/i)).toBeInTheDocument();
		expect(within(rogueRow).getByText(/flagged/i)).toBeInTheDocument();
	});
});
