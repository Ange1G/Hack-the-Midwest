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
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentDetail } from "./agent-detail";

function seedAgent() {
	const owner = signInAs();
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
		renderWithProviders(<AgentDetail agentId={agent.id} />);

		expect(
			await screen.findByRole("heading", { name: "Uptime checker" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Check the status page and summarise it."),
		).toBeInTheDocument();

		const call = await screen.findByRole("group", { name: "status" });
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

	it("starts a run with the optional input and shows its output without leaving the page", async () => {
		const agent = seedAgent();
		const user = userEvent.setup();
		const onRunChange = vi.fn();
		renderWithProviders(
			<AgentDetail
				agentId={agent.id}
				onRunChange={onRunChange}
				pollIntervalMs={5}
			/>,
		);

		await user.type(
			await screen.findByLabelText(/run input/i),
			"ticket INC-42",
		);
		await user.click(screen.getByRole("button", { name: /run agent/i }));

		await waitFor(() => expect(mockState.runs).toHaveLength(1));
		const run = mockState.runs[0];
		expect(run).toMatchObject({ agent_id: agent.id, input: "ticket INC-42" });
		expect(onRunChange).toHaveBeenCalledWith(run?.id);

		const panel = screen.getByRole("region", { name: "Run panel" });
		expect(
			await within(panel).findByText(
				/all checks passed/i,
				{},
				{ timeout: 4000 },
			),
		).toBeInTheDocument();
		expect(within(panel).getByText("Succeeded")).toBeInTheDocument();
		expect(within(panel).getByText("ticket INC-42")).toBeInTheDocument();
	});

	it("shows the latest run's output with no extra clicks", async () => {
		const agent = seedAgent();
		runToCompletion(createRun(agent));
		renderWithProviders(<AgentDetail agentId={agent.id} />);

		const panel = await screen.findByRole("region", { name: "Run panel" });
		expect(
			await within(panel).findByText(/all checks passed/i),
		).toBeInTheDocument();
	});

	it("loads a past run into the panel when it is picked from the history", async () => {
		const agent = seedAgent();
		runToCompletion(createRun(agent, "first"));
		runToCompletion(createRun(agent, "second"));
		const user = userEvent.setup();
		const onRunChange = vi.fn();
		renderWithProviders(
			<AgentDetail agentId={agent.id} onRunChange={onRunChange} />,
		);

		const panel = await screen.findByRole("region", { name: "Run panel" });
		const shown = (await within(panel).findByText(/^(first|second)$/))
			.textContent;
		const other = shown === "first" ? "second" : "first";

		const table = await screen.findByRole("table", {
			name: "Runs of this agent",
		});
		const rows = within(table).getAllByRole("row").slice(1);
		const otherRow = rows.find((row) => !row.hasAttribute("aria-current"));
		if (!otherRow) throw new Error("expected an unselected run row");
		await user.click(
			within(otherRow).getByRole("button", { name: "Show output" }),
		);

		expect(await within(panel).findByText(other)).toBeInTheDocument();
		expect(onRunChange).toHaveBeenCalledOnce();
		await waitFor(() =>
			expect(otherRow).toHaveAttribute("aria-current", "true"),
		);
	});

	it("lists previous runs with links to their pages", async () => {
		const agent = seedAgent();
		const run = createRun(agent);
		runToCompletion(run);
		renderWithProviders(<AgentDetail agentId={agent.id} />);

		const table = await screen.findByRole("table", {
			name: "Runs of this agent",
		});
		const row = within(table)
			.getByText(/succeeded/i)
			.closest("tr");
		if (!row) throw new Error("expected a run row");
		expect(
			within(row).getByRole("link", { name: /view run/i }),
		).toHaveAttribute("href", `/runs/${run.id}`);
	});

	it("shows an error state when the agent does not exist", async () => {
		signInAs();
		renderWithProviders(<AgentDetail agentId="agt_missing" />);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
