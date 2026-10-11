import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { webhookFireUrl } from "#/lib/api/queries";
import { SECRET_PLACEHOLDER } from "#/lib/http-contract";
import { createAgent, createChain, createWebhook, mockState } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { chooseOption } from "#/test/select";
import { signInAs } from "#/test/session";
import { WebhookList } from "./webhook-list";

describe("WebhookList", () => {
	it("creates a webhook and shows the secret once", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const user = userEvent.setup();
		renderWithProviders(<WebhookList />);

		await chooseOption(
			user,
			await screen.findByLabelText(/^agent$/i),
			agent.title,
		);
		await user.click(screen.getByRole("button", { name: /create webhook/i }));

		expect(
			await screen.findByText(/copy this secret now/i),
		).toBeInTheDocument();
		await waitFor(() => expect(mockState.webhooks).toHaveLength(1));
		const created = mockState.webhooks[0];
		if (!created) throw new Error("expected a webhook");
		expect(screen.getByText(webhookFireUrl(created.id))).toBeInTheDocument();
		expect(screen.getByText(created.secret)).toBeInTheDocument();

		const table = await screen.findByRole("table");
		expect(within(table).getByText(SECRET_PLACEHOLDER)).toBeInTheDocument();
		expect(within(table).queryByText(created.secret)).not.toBeInTheDocument();
	});

	it("creates a webhook that targets a chain", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		createChain(owner.user_sso, {
			title: "Triage then summarize",
			steps: [{ agent_id: agent.id, label: "Check" }],
		});
		const user = userEvent.setup();
		renderWithProviders(<WebhookList />);

		await chooseOption(
			user,
			await screen.findByLabelText(/^target$/i),
			"Chain",
		);
		await chooseOption(user, screen.getByLabelText(/^chain$/i), /triage/i);
		await user.click(screen.getByRole("button", { name: /create webhook/i }));

		expect(
			await screen.findByText(/copy this secret now/i),
		).toBeInTheDocument();
		await waitFor(() => expect(mockState.webhooks).toHaveLength(1));
		expect(mockState.webhooks[0]?.target_type).toBe("chain");
	});

	it("deletes a webhook from the list", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		createWebhook(owner.user_sso, agent.id);
		const user = userEvent.setup();
		renderWithProviders(<WebhookList />);

		await user.click(
			await screen.findByRole("button", { name: /delete webhook/i }),
		);
		await waitFor(() => expect(mockState.webhooks).toHaveLength(0));
	});
});
