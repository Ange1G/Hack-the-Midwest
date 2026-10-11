import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { server } from "#/mocks/server";
import { insertAgent, mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentForm } from "./agent-form";

function seedAgent(owner: string, title: string) {
	return insertAgent(owner, {
		agentTitle: title,
		systemPrompt: `You are ${title}.`,
		configurations: { primitives: {}, dayOfWeek: [], timeOfDay: [] },
	});
}

describe("AgentForm memory and delegates", () => {
	it("sends memory and the chosen delegates with the agent", async () => {
		const owner = signInAs();
		const researcher = seedAgent(owner.user_sso, "Researcher");
		seedAgent(owner.user_sso, "Writer");
		const user = userEvent.setup();
		const onSaved = vi.fn();
		let sent: { configurations?: Record<string, unknown> } | undefined;
		server.events.on("request:start", async ({ request }) => {
			if (request.method === "POST" && request.url.includes("/agents/")) {
				sent = await request.clone().json();
			}
		});
		renderWithProviders(<AgentForm onSaved={onSaved} />);

		await user.type(await screen.findByLabelText(/^name$/i), "Lead");
		await user.type(
			screen.getByLabelText(/^instructions$/i),
			"Split the work between delegates.",
		);
		await user.click(screen.getByRole("switch", { name: "Memory" }));
		await user.click(
			await screen.findByRole("checkbox", { name: /Researcher/ }),
		);
		await user.click(screen.getByRole("button", { name: /create agent/i }));

		await waitFor(() => expect(onSaved).toHaveBeenCalled());
		expect(sent?.configurations).toMatchObject({
			memory: true,
			delegates: [researcher.id],
		});
		const created = mockState.agents.find((agent) => agent.title === "Lead");
		expect(created?.configurations).toMatchObject({
			memory: true,
			delegates: [researcher.id],
		});
	});

	it("does not offer the agent itself as a delegate", async () => {
		const owner = signInAs();
		const agent = seedAgent(owner.user_sso, "Solo");
		seedAgent(owner.user_sso, "Helper");
		renderWithProviders(<AgentForm agent={agent} onSaved={vi.fn()} />);
		expect(
			await screen.findByRole("checkbox", { name: /Helper/ }),
		).toBeInTheDocument();
		expect(screen.queryByRole("checkbox", { name: /Solo/ })).toBeNull();
	});
});
