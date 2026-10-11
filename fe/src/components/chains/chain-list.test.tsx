import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Toaster } from "#/components/ui/sonner";
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

		const table = await screen.findByRole("table");
		expect(
			within(table).getByRole("link", { name: "Nightly digest" }),
		).toHaveAttribute("href", `/chains/${chain.id}`);
	});

	it("shows recently updated chains as cards with their steps", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const chain = createChain(owner.user_sso, {
			title: "Nightly digest",
			steps: [{ agent_id: agent.id }, { agent_id: agent.id, label: "Recap" }],
		});
		renderWithProviders(<ChainList />);

		const recent = await screen.findByRole("region", {
			name: "Recently updated",
		});
		expect(
			within(recent).getByRole("link", { name: "Nightly digest" }),
		).toHaveAttribute("href", `/chains/${chain.id}`);
		const steps = within(recent).getByRole("list", { name: "Steps" });
		expect(within(steps).getByText("Recap")).toBeInTheDocument();
		expect(
			await within(steps).findByText("Uptime checker"),
		).toBeInTheDocument();
		expect(within(recent).getByText("On demand")).toBeInTheDocument();
	});

	it("runs a chain from its card", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		createChain(owner.user_sso, {
			title: "Nightly digest",
			steps: [{ agent_id: agent.id }],
		});
		const user = userEvent.setup();
		renderWithProviders(
			<>
				<ChainList />
				<Toaster />
			</>,
		);

		await user.click(
			await screen.findByRole("button", { name: "Run Nightly digest" }),
		);
		expect(await screen.findByText("Chain run started")).toBeInTheDocument();
		expect(mockState.chainRuns).toHaveLength(1);
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

		const table = await screen.findByRole("table");
		await user.click(
			within(table).getByRole("button", { name: /delete chain/i }),
		);
		await waitFor(() => expect(mockState.chains).toHaveLength(0));
	});
});
