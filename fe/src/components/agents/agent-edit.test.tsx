import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createAgent, mockState } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentEdit } from "./agent-edit";

describe("AgentEdit", () => {
	it("loads the agent and saves a title change", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const user = userEvent.setup();
		renderWithProviders(<AgentEdit agentId={agent.id} />);

		expect(
			await screen.findByRole("heading", { name: "Edit configuration" }),
		).toBeInTheDocument();
		const name = screen.getByLabelText(/^name$/i);
		expect(name).toHaveValue("Uptime checker");
		await user.clear(name);
		await user.type(name, "Status watcher");
		await user.click(screen.getByRole("button", { name: /save changes/i }));

		await waitFor(() =>
			expect(mockState.agents[0]?.title).toBe("Status watcher"),
		);
		expect(
			screen.getByRole("link", { name: /back to agent/i }),
		).toHaveAttribute("href", `/agents/${agent.id}`);
	});
});
