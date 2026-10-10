import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAgent } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentEdit } from "./agent-edit";

describe("AgentEdit", () => {
	it("loads the agent into a read-only configuration form", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		renderWithProviders(<AgentEdit agentId={agent.id} />);

		expect(
			await screen.findByRole("heading", { name: "Edit configuration" }),
		).toBeInTheDocument();
		expect(screen.getByLabelText(/^name$/i)).toHaveValue("Uptime checker");
		expect(
			screen.getByRole("button", { name: /save changes/i }),
		).toBeDisabled();
		expect(
			screen.getByRole("link", { name: /back to agent/i }),
		).toHaveAttribute("href", `/agents/${agent.id}`);
	});
});
