import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createAgent, createChain, createChainRun } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { ChainRunView } from "./chain-run-view";

function seedChainRun(input: string | null = "INC-3") {
	const owner = signInAs();
	const first = createAgent(owner.user_sso, safeAgentInput);
	const second = createAgent(owner.user_sso, {
		...safeAgentInput,
		agentTitle: "Summarizer",
		configurations: {
			...safeAgentInput.configurations,
			primitives: {
				summarize: safeAgentInput.configurations.primitives.status,
			},
		},
	});
	const chain = createChain(owner.user_sso, {
		title: "Check then summarize",
		steps: [
			{ agent_id: first.id, label: "Check" },
			{ agent_id: second.id, label: "Summarize" },
		],
	});
	return createChainRun(chain, input);
}

describe("ChainRunView", () => {
	it("polls a chain run to succeeded and shows the final result", async () => {
		const run = seedChainRun();
		renderWithProviders(
			<ChainRunView chainRunId={run.id} pollIntervalMs={5} />,
		);

		expect(
			await screen.findByText(/succeeded/i, {}, { timeout: 8000 }),
		).toBeInTheDocument();
		expect(await screen.findByText(/all checks passed/i)).toBeInTheDocument();
		expect(screen.getByText("INC-3")).toBeInTheDocument();
	});

	it("loads the process timeline on demand", async () => {
		const run = seedChainRun();
		const user = userEvent.setup();
		renderWithProviders(
			<ChainRunView chainRunId={run.id} pollIntervalMs={5} />,
		);

		await screen.findByText(/succeeded/i, {}, { timeout: 8000 });
		await user.click(screen.getByRole("button", { name: /show process/i }));

		expect(await screen.findByText(/step 1/i)).toBeInTheDocument();
		expect(screen.getByText(/step 2/i)).toBeInTheDocument();
		await waitFor(() =>
			expect(
				screen.getAllByRole("link", { name: /view execution/i }),
			).toHaveLength(2),
		);
	});

	it("shows an error state when the chain run does not exist", async () => {
		signInAs();
		renderWithProviders(
			<ChainRunView chainRunId="crun_missing" pollIntervalMs={5} />,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
