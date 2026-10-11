import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAgent, createRun } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { actAs } from "#/test/identity";
import { renderWithProviders } from "#/test/render";
import { RunView } from "./run-view";

describe("RunView", () => {
	it("polls a run from queued to succeeded and shows its output and tool calls", async () => {
		const owner = actAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const run = createRun(agent);

		renderWithProviders(<RunView runId={run.id} pollIntervalMs={5} />);

		// Loads behind a sketch of the run page: header, timeline, two panels.
		expect(await screen.findByRole("status")).toHaveAttribute(
			"data-layout",
			"run",
		);

		expect(
			await screen.findByText(/succeeded/i, {}, { timeout: 4000 }),
		).toBeInTheDocument();
		expect(await screen.findByText(/all checks passed/i)).toBeInTheDocument();
		expect(
			screen.getByText(/status\.example\.com\/api\/v2\/status\.json/),
		).toBeInTheDocument();
		expect(
			await screen.findByRole("heading", { name: /uptime checker/i }),
		).toBeInTheDocument();
	});

	it("shows an error state when the run does not exist", async () => {
		actAs();
		renderWithProviders(<RunView runId="run_missing" pollIntervalMs={5} />);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
