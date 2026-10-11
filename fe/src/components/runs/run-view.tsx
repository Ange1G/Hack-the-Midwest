import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect } from "react";
import { PageHeader, Section } from "#/components/layout/page";
import { ErrorState, LoadingState } from "#/components/states";
import {
	agentQueryOptions,
	isActiveRunStatus,
	useRun,
} from "#/lib/api/queries";
import { watchRun } from "#/lib/run-watch";
import { backLinkClass } from "#/lib/styles";
import { RunDetails } from "./run-details";

export function RunView({
	runId,
	pollIntervalMs,
}: {
	runId: string;
	pollIntervalMs?: number;
}) {
	const run = useRun(runId, { pollIntervalMs });
	const agentId = run.data?.agent_id;
	const status = run.data?.status;
	const agent = useQuery({
		...agentQueryOptions(agentId ?? ""),
		enabled: agentId !== undefined,
	});

	useEffect(() => {
		if (status && isActiveRunStatus(status)) watchRun(runId);
	}, [status, runId]);

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

	return (
		<>
			<PageHeader
				title={agent.data?.title ?? "Run"}
				description={<span className="font-mono text-xs">{data.id}</span>}
				eyebrow={
					<Link
						to="/agents/$agentId"
						params={{ agentId: data.agent_id }}
						search={{ run: data.id }}
						className={backLinkClass}
					>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Back to agent
					</Link>
				}
			/>
			<Section title="Run">
				<RunDetails run={data} />
			</Section>
		</>
	);
}
