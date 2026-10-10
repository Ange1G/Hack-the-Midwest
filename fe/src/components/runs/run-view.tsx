import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageHeader } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { type Tone, ToneBadge } from "#/components/tone-badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	agentQueryOptions,
	findingsQueryOptions,
	isActiveRunStatus,
	queryKeys,
	useRun,
	useRunEvents,
} from "#/lib/api/queries";
import type { Run, RunEvent } from "#/lib/api/schemas";
import { formatDateTime, formatDuration } from "#/lib/format";
import { textLinkClass } from "#/lib/styles";

export function RunView({
	runId,
	pollIntervalMs,
}: {
	runId: string;
	pollIntervalMs?: number;
}) {
	const queryClient = useQueryClient();
	const run = useRun(runId, { pollIntervalMs });
	const events = useRunEvents(runId, { pollIntervalMs });
	const agentId = run.data?.agent_id;
	const status = run.data?.status;
	const agent = useQuery({
		...agentQueryOptions(agentId ?? ""),
		enabled: agentId !== undefined,
	});
	const findings = useQuery({
		...findingsQueryOptions({ run_id: runId }),
		enabled: status === "killed",
	});

	// Once the run settles, the agent's last-run summary and history are stale.
	useEffect(() => {
		if (agentId && status && !isActiveRunStatus(status)) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.agent(agentId),
			});
		}
	}, [agentId, status, queryClient]);

	if (run.isPending) {
		return <LoadingState label="Loading run…" />;
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
	const finding = findings.data?.[0];
	const live = isActiveRunStatus(data.status);

	return (
		<>
			<PageHeader
				title={agent.data?.name ?? "Run"}
				description={`Run ${data.id}`}
				action={<StatusBadge status={data.status} />}
			/>

			{data.status === "killed" ? (
				<Notice
					tone="danger"
					className="mb-6"
					title={data.error ?? "Terminated by the security monitor"}
				>
					{finding ? (
						<>
							<p>{finding.message}</p>
							<p>
								<code>{finding.rule}</code> · severity {finding.severity}
							</p>
						</>
					) : null}
					<p>
						<Link to="/security" className={textLinkClass}>
							See all findings
						</Link>
					</p>
				</Notice>
			) : null}

			{data.status === "failed" && data.error ? (
				<Notice tone="danger" className="mb-6" title="Run failed">
					<p>{data.error}</p>
				</Notice>
			) : null}

			<Timeline run={data} />

			<div className="mt-6 grid gap-6 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Output</CardTitle>
					</CardHeader>
					<CardContent>
						{data.output ? (
							<pre className="whitespace-pre-wrap text-sm">{data.output}</pre>
						) : (
							<p className="text-sm text-muted-foreground">
								{live ? "Waiting for the agent to finish…" : "No output."}
							</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Event log</CardTitle>
					</CardHeader>
					<CardContent>
						<EventLog events={events.data ?? []} live={live} />
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

const eventTone: Record<RunEvent["type"], Tone> = {
	log: "neutral",
	tool_call: "info",
	tool_result: "info",
	security: "danger",
};

function EventLog({ events, live }: { events: RunEvent[]; live: boolean }) {
	if (events.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				{live ? "Waiting for the first event…" : "No events were recorded."}
			</p>
		);
	}
	return (
		<ol
			className="space-y-2 font-mono text-xs"
			aria-live={live ? "polite" : "off"}
		>
			{events.map((event) => (
				<li key={event.id} className="flex items-start gap-2">
					<span className="shrink-0 text-muted-foreground">
						{new Date(event.ts).toLocaleTimeString()}
					</span>
					<ToneBadge tone={eventTone[event.type]} className="shrink-0">
						{event.type}
					</ToneBadge>
					<span className="break-all">{event.message}</span>
				</li>
			))}
		</ol>
	);
}
