import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { isActiveRunStatus, queryKeys, useRun } from "#/lib/api/queries";
import type { Agent, Pagination, Run } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { formatDuration } from "#/lib/format";
import { unwatchRun, useWatchedRuns } from "#/lib/run-watch";

type AgentList = { items: Agent[]; pagination: Pagination | null };

function agentTitle(queryClient: QueryClient, agentId: string): string {
	const agent =
		queryClient.getQueryData<Agent>(queryKeys.agent(agentId)) ??
		queryClient
			.getQueryData<AgentList>(queryKeys.agents)
			?.items.find((item) => item.id === agentId);
	return agent?.title ?? "Agent run";
}

function refreshAfterRun(queryClient: QueryClient, run: Run) {
	void queryClient.invalidateQueries({
		queryKey: queryKeys.agent(run.agent_id),
	});
	void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
	void queryClient.invalidateQueries({ queryKey: queryKeys.executions });
	void queryClient.invalidateQueries({
		queryKey: queryKeys.agentRuns(run.agent_id),
	});
}

function WatchedRun({
	runId,
	pollIntervalMs,
}: {
	runId: string;
	pollIntervalMs?: number;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const run = useRun(runId, { pollIntervalMs });
	const data = run.data;

	useEffect(() => {
		if (run.isError) {
			unwatchRun(runId);
			return;
		}
		if (!data || isActiveRunStatus(data.status)) return;
		unwatchRun(runId);
		refreshAfterRun(queryClient, data);

		const title = agentTitle(queryClient, data.agent_id);
		// The toast id makes a repeated report of the same run replace, not stack.
		const options = {
			id: `run-finished-${data.id}`,
			action: {
				label: "View output",
				onClick: () =>
					void navigate({
						to: "/agents/$agentId",
						params: { agentId: data.agent_id },
						search: { run: data.id },
					}),
			},
		};
		if (data.status === "succeeded") {
			const duration = formatDuration(data.started_at, data.finished_at);
			notify.success(`${title} finished`, {
				...options,
				description: duration ? `Succeeded in ${duration}` : "Succeeded",
			});
		} else if (data.status === "timed_out") {
			notify.error(`${title} timed out`, undefined, {
				...options,
				description: data.error_message ?? "Execution timed out",
			});
		} else {
			notify.error(`${title} failed`, undefined, {
				...options,
				description: data.error_message ?? "The run did not complete.",
			});
		}
	}, [data, run.isError, runId, queryClient, navigate]);

	return null;
}

// Mounted once in the authenticated shell: reports every watched run's
// outcome exactly once, even after the user navigates away from it.
export function RunWatcher({ pollIntervalMs }: { pollIntervalMs?: number }) {
	const runIds = useWatchedRuns();
	return (
		<>
			{runIds.map((runId) => (
				<WatchedRun key={runId} runId={runId} pollIntervalMs={pollIntervalMs} />
			))}
		</>
	);
}
