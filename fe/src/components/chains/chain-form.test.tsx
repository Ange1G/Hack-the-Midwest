import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createAgent, mockState } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { chooseOption } from "#/test/select";
import { signInAs } from "#/test/session";
import { ChainForm } from "./chain-form";

describe("ChainForm", () => {
	it("requires a name and agents before calling the API", async () => {
		signInAs();
		const user = userEvent.setup();
		renderWithProviders(<ChainForm />);

		await user.click(
			await screen.findByRole("button", { name: /create chain/i }),
		);

		expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
		expect(
			screen
				.getAllByRole("alert")
				.some((el) => /choose an agent/i.test(el.textContent ?? "")),
		).toBe(true);
		expect(mockState.chains).toHaveLength(0);
	});

	it("reorders steps and creates a chain", async () => {
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
		const user = userEvent.setup();
		renderWithProviders(<ChainForm />);

		await user.type(
			await screen.findByLabelText(/^name$/i),
			"Check then summarize",
		);

		const agentSelects = await screen.findAllByLabelText(/^agent$/i);
		await chooseOption(user, agentSelects[0] as HTMLElement, first.title);
		await chooseOption(user, agentSelects[1] as HTMLElement, second.title);

		await user.click(screen.getByRole("button", { name: /move step 2 up/i }));
		await user.click(screen.getByRole("button", { name: /create chain/i }));

		await waitFor(() => expect(mockState.chains).toHaveLength(1));
		expect(mockState.chains[0]?.steps.map((step) => step.agent_id)).toEqual([
			second.id,
			first.id,
		]);
	});
});
