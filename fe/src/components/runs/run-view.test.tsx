import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAgent, createRun, runToCompletion } from "#/mocks/state";
import { rogueAgentInput, safeAgentInput } from "#/test/fixtures";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { RunView } from "./run-view";

describe("RunView", () => {
	it("polls a run from queued to succeeded and shows its output", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const run = createRun(agent);

		renderWithProviders(<RunView runId={run.id} pollIntervalMs={5} />);

		expect(
			await screen.findByText(/succeeded/i, {}, { timeout: 4000 }),
		).toBeInTheDocument();
		expect(await screen.findByText(/all checks passed/i)).toBeInTheDocument();
		expect(
			await screen.findByRole("heading", { name: /uptime checker/i }),
		).toBeInTheDocument();
	});

	it("shows the failed state together with the policy error", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, rogueAgentInput);
		const run = createRun(agent);
		runToCompletion(run);

		renderWithProviders(<RunView runId={run.id} pollIntervalMs={5} />);

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/terminated by the security monitor/i);
		await waitFor(() =>
			expect(alert).toHaveTextContent(/untrusted destination/i),
		);
		expect(screen.getByText(/^failed$/i)).toBeInTheDocument();
	});

	it("shows an error state when the run does not exist", async () => {
		signInAs();
		renderWithProviders(<RunView runId="run_missing" pollIntervalMs={5} />);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
