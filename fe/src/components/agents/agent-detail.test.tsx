import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	createAgent,
	createRun,
	mockState,
	runToCompletion,
} from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { actAs } from "#/test/identity";
import { renderWithProviders } from "#/test/render";
import { AgentDetail } from "./agent-detail";

function seedAgent() {
	const owner = actAs();
	return createAgent(owner.user_sso, {
		...safeAgentInput,
		configurations: {
			primitives: {
				status: {
					...safeAgentInput.configurations.primitives.status,
					authorizationHeader: "Bearer tok-456",
					options: { retries: 2, timeout: 5000 },
				},
			},
			dayOfWeek: [1, 3, 5],
			timeOfDay: [540, 1020],
		},
	});
}

describe("AgentDetail", () => {
	it("shows the agent's name, instructions, HTTP calls, and schedule", async () => {
		const agent = seedAgent();
		renderWithProviders(
			<AgentDetail agentId={agent.id} onRunStarted={vi.fn()} />,
		);

		expect(
			await screen.findByRole("heading", { name: "Uptime checker" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Check the status page and summarise it."),
		).toBeInTheDocument();

		const call = screen.getByRole("group", { name: "status" });
		expect(within(call).getByText("GET")).toBeInTheDocument();
		expect(
			within(call).getByText("https://status.example.com/api/v2/status.json"),
		).toBeInTheDocument();
		expect(within(call).getByText(/authorization header/i)).toHaveTextContent(
			/configured/i,
		);
		expect(within(call).queryByText(/tok-456/)).not.toBeInTheDocument();
		expect(within(call).getByText(/2 retries/i)).toBeInTheDocument();
		expect(within(call).getByText(/5000 ms/i)).toBeInTheDocument();

		expect(screen.getByText(/mon, wed, fri/i)).toBeInTheDocument();
		expect(screen.getByText(/09:00, 17:00/i)).toBeInTheDocument();
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
		expect(
			within(row).getByRole("link", { name: /view run/i }),
		).toHaveAttribute("href", `/runs/${run.id}`);
	});

	it("shows an error state when the agent does not exist", async () => {
		actAs();
		renderWithProviders(
			<AgentDetail agentId="agt_missing" onRunStarted={vi.fn()} />,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
