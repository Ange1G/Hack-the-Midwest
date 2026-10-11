import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader, Section } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { OutputBlock } from "#/components/runs/output-block";
import { ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { Button } from "#/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
import {
	chainQueryOptions,
	isActiveChainRunStatus,
	queryKeys,
	useAgents,
	useChainRun,
	useChainRunSteps,
} from "#/lib/api/queries";
import type { ChainRunStep } from "#/lib/api/schemas";
import { formatDateTime } from "#/lib/format";
import { backLinkClass, textLinkClass } from "#/lib/styles";

export function ChainRunView({
	chainRunId,
	pollIntervalMs,
}: {
	chainRunId: string;
	pollIntervalMs?: number;
}) {
	const queryClient = useQueryClient();
	const run = useChainRun(chainRunId, { pollIntervalMs });
	const chainId = run.data?.chain_id;
	const status = run.data?.status;
	const chain = useQuery({
		...chainQueryOptions(chainId ?? ""),
		enabled: chainId !== undefined,
	});
	const [processOpen, setProcessOpen] = useState(false);
	const steps = useChainRunSteps(chainRunId, processOpen);

	useEffect(() => {
		if (status && !isActiveChainRunStatus(status)) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.chainRunSteps(chainRunId),
			});
		}
	}, [status, chainRunId, queryClient]);

	if (run.isPending) {
		return <LoadingState label="Loading chain run…" />;
	}
	if (run.isError) {
		return (
			<ErrorState
				title="Could not load chain run"
				error={run.error}
				onRetry={() => void run.refetch()}
			/>
		);
	}

	const data = run.data;
	const live = isActiveChainRunStatus(data.status);
	const output = data.final_result?.output;

	return (
		<>
			<PageHeader
				title={chain.data?.title ?? "Chain run"}
				description={<span className="font-mono text-xs">{data.id}</span>}
				meta={<StatusBadge status={data.status} />}
				eyebrow={
					<Link
						to="/chains/$chainId"
						params={{ chainId: data.chain_id }}
						className={backLinkClass}
					>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Back to chain
					</Link>
				}
			/>

			{data.status === "failed" && data.error_message ? (
				<Notice tone="danger" className="mb-6" title="Chain failed">
					<p>{data.error_message}</p>
					{data.error_code ? (
						<p>
							<code>{data.error_code}</code>
						</p>
					) : null}
				</Notice>
			) : null}

			{data.input ? (
				<Section title="Run input" className="mb-6">
					<OutputBlock label="Run input" value={data.input} />
				</Section>
			) : null}

			<Section
				title="Final result"
				description={`Started ${formatDateTime(data.started_at)}${
					data.finished_at
						? ` · Finished ${formatDateTime(data.finished_at)}`
						: ""
				}`}
			>
				{output ? (
					<OutputBlock label="Final result" value={output} />
				) : (
					<p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
						{live ? (
							<Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
						) : null}
						{live ? "Waiting for the last step to finish…" : "No final result."}
					</p>
				)}
			</Section>

			<Collapsible
				open={processOpen}
				onOpenChange={setProcessOpen}
				className="mt-6"
			>
				<CollapsibleTrigger asChild>
					<Button type="button" variant="outline" size="sm">
						<ChevronRightIcon
							aria-hidden="true"
							className={
								processOpen
									? "rotate-90 transition-transform"
									: "transition-transform"
							}
						/>
						{processOpen ? "Hide process" : "Show process"}
					</Button>
				</CollapsibleTrigger>
				<CollapsibleContent className="mt-4">
					{steps.isPending ? (
						<LoadingState label="Loading process…" />
					) : steps.isError ? (
						<ErrorState
							title="Could not load process"
							error={steps.error}
							onRetry={() => void steps.refetch()}
						/>
					) : (
						<ChainStepTimeline steps={steps.data ?? []} />
					)}
				</CollapsibleContent>
			</Collapsible>
		</>
	);
}

function ChainStepTimeline({ steps }: { steps: ChainRunStep[] }) {
	const agents = useAgents();
	const titleFor = (agentId: string) =>
		agents.data?.items.find((agent) => agent.id === agentId)?.title ?? agentId;
	const ordered = [...steps].sort((a, b) => a.position - b.position);

	return (
		<ol className="space-y-4 border-l pl-4">
			{ordered.map((step) => (
				<li key={`${step.position}-${step.agent_id}`} className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<StatusBadge status={step.status} />
						<span className="text-sm font-medium">
							Step {step.position + 1}
						</span>
						<Link
							to="/agents/$agentId"
							params={{ agentId: step.agent_id }}
							className={textLinkClass}
						>
							{step.label || titleFor(step.agent_id)}
						</Link>
						{step.execution_id ? (
							<Link
								to="/runs/$runId"
								params={{ runId: step.execution_id }}
								className={textLinkClass}
							>
								View execution
							</Link>
						) : null}
					</div>
					{step.result?.output ? (
						<OutputBlock
							label={`Step ${step.position + 1} output`}
							value={step.result.output}
						/>
					) : null}
					{step.error_message ? (
						<p className="text-sm text-destructive">{step.error_message}</p>
					) : null}
				</li>
			))}
		</ol>
	);
}
