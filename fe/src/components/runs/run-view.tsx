import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { PageHeader } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	agentQueryOptions,
	isActiveRunStatus,
	queryKeys,
	useRun,
} from "#/lib/api/queries";
import type { Run } from "#/lib/api/schemas";
import { formatDateTime, formatDuration } from "#/lib/format";

export function RunView({
	runId,
	pollIntervalMs,
}: {
	runId: string;
	pollIntervalMs?: number;
}) {
	const queryClient = useQueryClient();
	const run = useRun(runId, { pollIntervalMs });
	const agentId = run.data?.agent_id;
	const status = run.data?.status;
	const agent = useQuery({
		...agentQueryOptions(agentId ?? ""),
		enabled: agentId !== undefined,
	});

	useEffect(() => {
		if (agentId && status && !isActiveRunStatus(status)) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agent(agentId),
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.executions,
			});
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agentRuns(agentId),
			});
		}
	}, [agentId, status, queryClient]);

	if (run.isPending) {
		return <LoadingState label="Loading run…" layout="run" />;
	}
	if (run.isError) {
		return (
			<ErrorState
				title="Could not load run"
				error={run.error}
				onRetry={() => void run.refetch()}
			/>
		);
	}

	const data = run.data;
	const live = isActiveRunStatus(data.status);
	const output = data.result?.output;
	const toolCalls = data.result?.tool_calls;

	return (
		<>
			<PageHeader
				title={agent.data?.title ?? "Run"}
				description={`Run ${data.id}`}
				action={<StatusBadge status={data.status} />}
			/>

			{data.status === "failed" && data.error_message ? (
				<Notice tone="danger" className="mb-6" title="Run failed">
					<p>{data.error_message}</p>
					{data.error_code ? (
						<p>
							<code>{data.error_code}</code>
						</p>
					) : null}
				</Notice>
			) : null}

			{data.status === "timed_out" ? (
				<Notice tone="danger" className="mb-6" title="Run timed out">
					<p>{data.error_message ?? "Execution timed out"}</p>
				</Notice>
			) : null}

			<Timeline run={data} />

			<div className="mt-6 grid gap-6 lg:grid-cols-2">
				<Card className="island-shell">
					<CardHeader>
						<CardTitle>Output</CardTitle>
					</CardHeader>
					<CardContent>
						{output ? (
							<pre className="whitespace-pre-wrap text-sm">{output}</pre>
						) : (
							<p className="text-sm text-muted-foreground">
								{live ? "Waiting for the agent to finish…" : "No output."}
							</p>
						)}
					</CardContent>
				</Card>
				<Card className="island-shell">
					<CardHeader>
						<CardTitle>Tool calls</CardTitle>
					</CardHeader>
					<CardContent>
						{toolCalls && toolCalls.length > 0 ? (
							<pre className="overflow-x-auto whitespace-pre-wrap text-xs">
								{JSON.stringify(toolCalls, null, 2)}
							</pre>
						) : (
							<p className="text-sm text-muted-foreground">
								{live
									? "Waiting for the first tool call…"
									: "No tool calls were recorded."}
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}

function Timeline({ run }: { run: Run }) {
	const steps = [
		{ label: "Queued", at: run.created_at },
		{ label: "Started", at: run.started_at },
		{ label: "Finished", at: run.finished_at },
	];
	const duration = formatDuration(run.started_at, run.finished_at);
	return (
		<ol className="flex flex-wrap gap-6 text-sm">
			{steps.map((step) => (
				<li key={step.label}>
					<span className="font-medium">{step.label}</span>{" "}
					<span className="text-muted-foreground">
						{step.at ? formatDateTime(step.at) : "—"}
					</span>
				</li>
			))}
			{duration ? (
				<li>
					<span className="font-medium">Duration</span>{" "}
					<span className="text-muted-foreground">{duration}</span>
				</li>
			) : null}
		</ol>
	);
}
