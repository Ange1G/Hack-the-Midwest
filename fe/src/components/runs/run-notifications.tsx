import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { statusLabel } from "#/components/status-badge";
import {
	agentQueryOptions,
	isActiveRunStatus,
	queryKeys,
	useRun,
} from "#/lib/api/queries";
import { unwatchRun, useWatchedRuns } from "#/lib/run-watch";
import { toast } from "#/lib/toast";

const EXCERPT_LENGTH = 140;

function excerpt(text: string | null | undefined): string | undefined {
	if (!text) return undefined;
	const single = text.replace(/\s+/g, " ").trim();
	return single.length > EXCERPT_LENGTH
		? `${single.slice(0, EXCERPT_LENGTH - 1)}…`
		: single;
}

// Watches every run started in this session and announces how it ended, so
// the person can keep working anywhere in the app meanwhile.
export function RunNotifications({
	pollIntervalMs,
}: {
	pollIntervalMs?: number;
}) {
	const ids = useWatchedRuns();
	return (
		<>
			{ids.map((id) => (
				<WatchedRun key={id} runId={id} pollIntervalMs={pollIntervalMs} />
			))}
		</>
	);
}

function WatchedRun({
	runId,
	pollIntervalMs,
}: {
	runId: string;
	pollIntervalMs?: number;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	// Shares the run page's query, so a run is never polled twice.
	const run = useRun(runId, { pollIntervalMs });
	const data = run.data;
	const runMissing = run.isError;
	const agentId = data?.agent_id;
	const agent = useQuery({
		...agentQueryOptions(agentId ?? ""),
		enabled: agentId !== undefined,
	});
	const agentTitle = agent.data?.title;
	const titleReady = agent.isSuccess || agent.isError;
	const settled = data !== undefined && !isActiveRunStatus(data.status);
	const onRunPage = pathname === `/runs/${runId}`;
	const announced = useRef(false);

	useEffect(() => {
		if (announced.current) return;
		if (runMissing) {
			// Gone, or no longer ours: nothing to announce.
			announced.current = true;
			unwatchRun(runId);
			return;
		}
		if (!settled || !data || !titleReady) return;
		announced.current = true;
		unwatchRun(runId);
		// The list and the agent's history show the outcome too.
		for (const queryKey of [
			queryKeys.agent(data.agent_id),
			queryKeys.agents,
			queryKeys.executions,
			queryKeys.agentRuns(data.agent_id),
		]) {
			void queryClient.invalidateQueries({ queryKey });
		}
		// The run page shows the outcome itself.
		if (onRunPage) return;
		const succeeded = data.status === "succeeded";
		toast({
			title: `${agentTitle ?? "Agent"} — ${statusLabel(data.status)}`,
			description: excerpt(
				succeeded ? data.result?.output : data.error_message,
			),
			tone: succeeded ? "success" : "danger",
			durationMs: succeeded ? 8_000 : 15_000,
			action: {
				label: "View run",
				onSelect: () => {
					void router.navigate({ to: "/runs/$runId", params: { runId } });
				},
			},
		});
	}, [
		runMissing,
		settled,
		data,
		titleReady,
		onRunPage,
		agentTitle,
		router,
		queryClient,
		runId,
	]);

	return null;
}
