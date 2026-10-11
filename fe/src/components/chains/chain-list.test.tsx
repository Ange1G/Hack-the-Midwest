import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createAgent, createChain, mockState } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { ChainList } from "./chain-list";

describe("ChainList", () => {
	it("lists chains with links to their pages", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const chain = createChain(owner.user_sso, {
			title: "Nightly digest",
			steps: [{ agent_id: agent.id, label: "Digest" }],
		});
		renderWithProviders(<ChainList />);

		const link = await screen.findByRole("link", { name: "Nightly digest" });
		expect(link).toHaveAttribute("href", `/chains/${chain.id}`);
	});

	it("deletes a chain from the list", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		createChain(owner.user_sso, {
			title: "Nightly digest",
			steps: [{ agent_id: agent.id }],
		});
		const user = userEvent.setup();
		renderWithProviders(<ChainList />);

		await user.click(
			await screen.findByRole("button", { name: /delete chain/i }),
		);
		await waitFor(() => expect(mockState.chains).toHaveLength(0));
	});
});
