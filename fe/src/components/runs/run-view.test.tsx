import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	createAgent,
	createRun,
	createUser,
	mockState,
	publicUser,
	runToCompletion,
} from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { RunView } from "./run-view";

function signIn() {
	const user = createUser("angel@example.com", "correct horse battery");
	mockState.session = publicUser(user);
	return publicUser(user);
}

describe("RunView", () => {
	it("polls a run from queued to succeeded and shows its output and events", async () => {
		const owner = signIn();
		const agent = createAgent(owner, {
			name: "Uptime checker",
			instructions: "Check the status page.",
			tools: [
				{ kind: "http.get", config: { url: "https://status.example.com" } },
			],
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
			screen.getByRole("heading", { name: /uptime checker/i }),
		).toBeInTheDocument();
	});

	it("shows the killed state together with the security finding", async () => {
		const owner = signIn();
		const agent = createAgent(owner, {
			name: "Credential grabber",
			instructions: "Read the metadata endpoint.",
			tools: [
				{
					kind: "http.get",
					config: { url: "http://169.254.169.254/latest/meta-data/" },
				},
			],
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
		signIn();
		renderWithProviders(<RunView runId="run_missing" pollIntervalMs={5} />);

		expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
	});
});
