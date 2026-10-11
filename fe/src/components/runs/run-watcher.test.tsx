import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toaster } from "#/components/ui/sonner";
import { queryKeys } from "#/lib/api/queries";
import { useWatchedRuns, watchRun } from "#/lib/run-watch";
import { createAgent, createRun } from "#/mocks/state";
import { rogueAgentInput, safeAgentInput } from "#/test/fixtures";
import { createTestQueryClient } from "#/test/query";
import { renderWithProviders } from "#/test/render";
import { signInAs } from "#/test/session";
import { RunWatcher } from "./run-watcher";

function WatchedCount() {
	return <p>Watching {useWatchedRuns().length}</p>;
}

function renderWatcher() {
	const queryClient = createTestQueryClient();
	renderWithProviders(
		<>
			<RunWatcher pollIntervalMs={5} />
			<WatchedCount />
			<Toaster />
		</>,
		{ queryClient },
	);
	return queryClient;
}

describe("RunWatcher", () => {
	it("announces a watched run's success once and stops watching it", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, safeAgentInput);
		const run = createRun(agent);
		const queryClient = renderWatcher();
		queryClient.setQueryData(queryKeys.agent(agent.id), agent);

		watchRun(run.id);

		expect(
			await screen.findByText("Uptime checker finished", {}, { timeout: 4000 }),
		).toBeInTheDocument();
		expect(screen.getByText(/succeeded/i)).toBeInTheDocument();
		await waitFor(() =>
			expect(screen.getByText("Watching 0")).toBeInTheDocument(),
		);
		expect(screen.getAllByText("Uptime checker finished")).toHaveLength(1);
	});

	it("announces a failed run with its error", async () => {
		const owner = signInAs();
		const agent = createAgent(owner.user_sso, rogueAgentInput);
		const run = createRun(agent);
		const queryClient = renderWatcher();
		queryClient.setQueryData(queryKeys.agent(agent.id), agent);

		watchRun(run.id);

		expect(
			await screen.findByText("Secret leaker failed", {}, { timeout: 4000 }),
		).toBeInTheDocument();
		expect(screen.getByText(/untrusted destination/i)).toBeInTheDocument();
	});
});
