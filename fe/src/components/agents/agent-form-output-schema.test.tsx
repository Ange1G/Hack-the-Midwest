import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockState } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { AgentForm } from "./agent-form";

const SCHEMA = {
	type: "object",
	required: ["summary"],
	properties: { summary: { type: "string" } },
};

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
	await user.type(await screen.findByLabelText(/^name$/i), "Triage");
	await user.type(screen.getByLabelText(/^instructions$/i), "Classify alerts.");
}

describe("AgentForm structured output", () => {
	it("saves a JSON Schema on the agent configuration", async () => {
		signInAs();
		const user = userEvent.setup();
		const onSaved = vi.fn();
		renderWithProviders(<AgentForm onSaved={onSaved} />);

		await fillBasics(user);
		await user.click(screen.getByLabelText(/json schema/i));
		await user.paste(JSON.stringify(SCHEMA));
		await user.click(screen.getByRole("button", { name: /create agent/i }));

		await waitFor(() => expect(onSaved).toHaveBeenCalled());
		expect(mockState.agents[0]?.configurations.outputSchema).toEqual(SCHEMA);
	});

	it("refuses a schema that is not valid JSON before calling the API", async () => {
		signInAs();
		const user = userEvent.setup();
		const onSaved = vi.fn();
		renderWithProviders(<AgentForm onSaved={onSaved} />);

		await fillBasics(user);
		await user.click(screen.getByLabelText(/json schema/i));
		await user.paste('{"type": "object",');
		await user.click(screen.getByRole("button", { name: /create agent/i }));

		expect(
			await screen.findByText(/output schema must be valid json/i),
		).toBeInTheDocument();
		expect(onSaved).not.toHaveBeenCalled();
		expect(mockState.agents).toHaveLength(0);
	});

	it("prefills the schema when editing an agent", async () => {
		const owner = signInAs();
		const now = new Date().toISOString();
		renderWithProviders(
			<AgentForm
				onSaved={vi.fn()}
				agent={{
					id: "agt_1",
					title: "Triage",
					system_prompt: "Classify alerts.",
					configurations: {
						primitives: {},
						dayOfWeek: [],
						timeOfDay: [],
						outputSchema: SCHEMA,
					},
					schedule_month: null,
					schedule_day: null,
					schedule_time: null,
					owner_user_sso: owner.user_sso,
					created_at: now,
					updated_at: now,
					flagged: false,
					last_run: null,
				}}
			/>,
		);

		const field = await screen.findByLabelText(/json schema/i);
		expect(JSON.parse((field as HTMLTextAreaElement).value)).toEqual(SCHEMA);
	});
});
