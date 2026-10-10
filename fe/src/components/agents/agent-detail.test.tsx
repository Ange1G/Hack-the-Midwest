import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	createAgent,
	createRun,
	createUser,
	mockState,
	publicUser,
	runToCompletion,
} from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { AgentDetail } from "./agent-detail";

function signIn() {
	const user = createUser("angel@example.com", "correct horse battery");
	mockState.session = publicUser(user);
	return publicUser(user);
}

function seedAgent() {
	const owner = signIn();
	return createAgent(owner, {
		name: "Uptime checker",
		instructions: "Check the status page every hour.",
		tools: [
			{ kind: "http.get", config: { url: "https://status.example.com" } },
		],
	});
}

describe("AgentDetail", () => {
	it("shows the agent's name, instructions, and tools", async () => {
		const agent = seedAgent();
		renderWithProviders(
			<AgentDetail agentId={agent.id} onRunStarted={vi.fn()} />,
		);

		expect(
			await screen.findByRole("heading", { name: "Uptime checker" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Check the status page every hour."),
		).toBeInTheDocument();
		expect(screen.getByText("http.get")).toBeInTheDocument();
		expect(screen.getByText("https://status.example.com")).toBeInTheDocument();
	});

	it("starts a run and reports it", async () => {
		const agent = seedAgent();
		const user = userEvent.setup();
		const onRunStarted = vi.fn();
		renderWithProviders(
			<AgentDetail agentId={agent.id} onRunStarted={onRunStarted} />,
		);

		await user.click(await screen.findByRole("button", { name: /run agent/i }));

		await waitFor(() =>
			expect(onRunStarted).toHaveBeenCalledWith(
				expect.objectContaining({ status: "queued", agent_id: agent.id }),
			),
		);
		expect(mockState.runs).toHaveLength(1);
	});

	it("lists previous runs with links to their pages", async () => {
		const agent = seedAgent();
		const run = createRun(agent);
		runToCompletion(run);
		const user = userEvent.setup();
		renderWithProviders(
			<AgentDetail agentId={agent.id} onRunStarted={vi.fn()} />,
		);

		await user.click(await screen.findByRole("tab", { name: /runs/i }));

		const table = await screen.findByRole("table");
		const row = within(table)
			.getByText(/succeeded/i)
			.closest("tr");
		if (!row) throw new Error("expected a run row");
		expect(within(row).getByRole("link", { name: /view/i })).toHaveAttribute(
			"href",
			`/runs/${run.id}`,
		);
	});

	it("shows an error state when the agent does not exist", async () => {
		signIn();
		renderWithProviders(
			<AgentDetail agentId="agt_missing" onRunStarted={vi.fn()} />,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
