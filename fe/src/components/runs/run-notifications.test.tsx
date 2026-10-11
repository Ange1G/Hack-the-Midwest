import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AgentList } from "#/components/agents/agent-list";
import { Toaster } from "#/components/toaster";
import { getWatchedRuns, watchRun } from "#/lib/run-watch";
import { createAgent, createRun, mockState } from "#/mocks/state";
import { safeAgentInput } from "#/test/fixtures";
import { actAs } from "#/test/identity";
import { renderWithProviders } from "#/test/render";
import { RunNotifications } from "./run-notifications";

function startWatchedRun() {
	const owner = actAs();
	const agent = createAgent(owner.user_sso, safeAgentInput);
	const run = createRun(agent);
	watchRun(run.id);
	return run;
}

// The visible toasts live in Radix's "Notifications" region; the separate
// screen-reader announcement is portaled elsewhere, so queries stay scoped.
function notificationsRegion() {
	return screen.findByRole("region", { name: /notifications/i });
}

const toastsIn = (region: HTMLElement) =>
	region.querySelectorAll('[data-slot="toast"]');

async function findNotice(title: string): Promise<HTMLElement> {
	const region = await notificationsRegion();
	const text = await within(region).findByText(title, {}, { timeout: 4000 });
	const notice = text.closest<HTMLElement>('[data-slot="toast"]');
	if (!notice) throw new Error("expected the text inside a toast");
	return notice;
}

describe("RunNotifications", () => {
	it("announces a watched run when it finishes, with a way to open it", async () => {
		const run = startWatchedRun();
		const user = userEvent.setup();
		const { router } = renderWithProviders(
			<>
				<RunNotifications pollIntervalMs={5} />
				<Toaster />
			</>,
			{ path: "/agents" },
		);

		const notice = await findNotice("Uptime checker — Succeeded");
		expect(notice).toHaveTextContent(/all checks passed/i);
		expect(getWatchedRuns()).toEqual([]);

		await user.click(within(notice).getByRole("button", { name: "View run" }));

		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/runs/${run.id}`),
		);
	});

	it("stays quiet when the run page itself is open", async () => {
		const run = startWatchedRun();
		renderWithProviders(
			<>
				<RunNotifications pollIntervalMs={5} />
				<Toaster />
			</>,
			{ path: `/runs/${run.id}` },
		);

		await waitFor(() => expect(mockState.runs[0]?.status).toBe("succeeded"), {
			timeout: 4000,
		});
		await waitFor(() => expect(getWatchedRuns()).toEqual([]));
		expect(toastsIn(await notificationsRegion())).toHaveLength(0);
	});

	it("refreshes the agents list when a watched run settles", async () => {
		startWatchedRun();
		renderWithProviders(
			<>
				<AgentList />
				<RunNotifications pollIntervalMs={5} />
				<Toaster />
			</>,
			{ path: "/agents" },
		);

		const row = (
			await screen.findByRole("link", { name: "Uptime checker" })
		).closest("tr");
		if (!row) throw new Error("expected a table row");
		expect(within(row).getByText("Queued")).toBeInTheDocument();

		await findNotice("Uptime checker — Succeeded");

		await waitFor(() =>
			expect(within(row).getByText("Succeeded")).toBeInTheDocument(),
		);
	});

	it("can be dismissed", async () => {
		startWatchedRun();
		const user = userEvent.setup();
		renderWithProviders(
			<>
				<RunNotifications pollIntervalMs={5} />
				<Toaster />
			</>,
			{ path: "/agents" },
		);

		const notice = await findNotice("Uptime checker — Succeeded");
		const region = await notificationsRegion();
		await user.click(within(notice).getByRole("button", { name: "Dismiss" }));

		await waitFor(() => expect(toastsIn(region)).toHaveLength(0));
	});
});
