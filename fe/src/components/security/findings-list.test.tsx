import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAgent, createRun, runToCompletion } from "#/mocks/state";
import { rogueAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { FindingsList } from "./findings-list";

describe("FindingsList", () => {
	it("shows an empty state when the monitor has found nothing", async () => {
		signInAs();
		renderWithProviders(<FindingsList />);

		expect(await screen.findByText(/no findings/i)).toBeInTheDocument();
	});

	it("stays empty because findings are not served by the backend yet", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, rogueAgentInput);
		const run = createRun(agent);
		runToCompletion(run);

		renderWithProviders(<FindingsList />);

		expect(await screen.findByText(/no findings/i)).toBeInTheDocument();
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
	});
});
