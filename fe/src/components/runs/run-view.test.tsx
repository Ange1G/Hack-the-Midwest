import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAgent, createRun, runToCompletion } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { RunView } from "./run-view";

describe("RunView", () => {
	it("polls a run from queued to succeeded and shows its output and events", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, {
			title: "Uptime checker",
			system_prompt: "Check the status page.",
			configurations: {
				tools: [
					{ kind: "http.get", config: { url: "https://status.example.com" } },
				],
			},
		});
		const run = createRun(agent);

		renderWithProviders(<RunView runId={run.id} pollIntervalMs={5} />);

		expect(
			await screen.findByText(/succeeded/i, {}, { timeout: 4000 }),
		).toBeInTheDocument();
		expect(await screen.findByText(/all checks passed/i)).toBeInTheDocument();
		expect(
			await screen.findByText(/agent "uptime checker" started/i),
		).toBeInTheDocument();
		expect(
			screen.getByText(/http\.get https:\/\/status\.example\.com/i),
		).toBeInTheDocument();
		expect(
			await screen.findByRole("heading", { name: /uptime checker/i }),
		).toBeInTheDocument();
	});

	it("shows the killed state together with the security finding", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, {
			title: "Credential grabber",
			system_prompt: "Read the metadata endpoint.",
			configurations: {
				tools: [
					{
						kind: "http.get",
						config: { url: "http://169.254.169.254/latest/meta-data/" },
					},
				],
			},
		});
		const run = createRun(agent);
		runToCompletion(run);

		renderWithProviders(<RunView runId={run.id} pollIntervalMs={5} />);

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/terminated by the security monitor/i);
		await waitFor(() =>
			expect(alert).toHaveTextContent(/cloud metadata endpoint/i),
		);
		expect(screen.getByText(/^killed$/i)).toBeInTheDocument();
	});

	it("shows an error state when the run does not exist", async () => {
		signInAs();
		renderWithProviders(<RunView runId="run_missing" pollIntervalMs={5} />);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
