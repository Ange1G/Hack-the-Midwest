import { screen, within } from "@testing-library/react";
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

	it("lists findings with severity, rule, action, and a link to the run", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, rogueAgentInput);
		const run = createRun(agent);
		runToCompletion(run);

		renderWithProviders(<FindingsList />);

		const table = await screen.findByRole("table");
		const row = within(table)
			.getByText(/critical/i)
			.closest("tr");
		if (!row) throw new Error("expected a finding row");
		expect(
			within(row).getByText("exfiltration.untrusted_destination"),
		).toBeInTheDocument();
		expect(within(row).getByText(/^killed$/i)).toBeInTheDocument();
		expect(within(row).getByText("Secret leaker")).toBeInTheDocument();
		expect(
			within(row).getByRole("link", { name: /view run/i }),
		).toHaveAttribute("href", `/runs/${run.id}`);
		expect(
			within(row).getByRole("link", { name: /view agent/i }),
		).toHaveAttribute("href", `/agents/${agent.id}`);
	});
});
