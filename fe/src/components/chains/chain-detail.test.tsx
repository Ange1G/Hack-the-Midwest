import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createAgent, createChain, mockState } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { ChainDetail } from "./chain-detail";

function seedChain() {
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
	return { chain, first, second };
}

describe("ChainDetail", () => {
	it("shows the chain's steps and starts a run with optional input", async () => {
		const { chain, first } = seedChain();
		const user = userEvent.setup();
		const onRunStarted = vi.fn();
		renderWithProviders(
			<ChainDetail chainId={chain.id} onRunStarted={onRunStarted} />,
		);

		expect(
			await screen.findByRole("heading", { name: "Check then summarize" }),
		).toBeInTheDocument();
		expect(screen.getByText(first.title)).toBeInTheDocument();
		expect(screen.getByText("Check")).toBeInTheDocument();

		await user.type(screen.getByLabelText(/run input/i), "ticket INC-11");
		await user.click(screen.getByRole("button", { name: /run chain/i }));

		await waitFor(() =>
			expect(onRunStarted).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "running",
					chain_id: chain.id,
					input: "ticket INC-11",
				}),
			),
		);
		expect(mockState.chainRuns).toHaveLength(1);
	});

	it("shows an error state when the chain does not exist", async () => {
		signInAs();
		renderWithProviders(
			<ChainDetail chainId="chn_missing" onRunStarted={vi.fn()} />,
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
