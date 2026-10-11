import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import { PageHeader, Section } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { RelativeTime } from "#/components/relative-time";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
	queryKeys,
	useAgents,
	useChain,
	useStartChainRun,
} from "#/lib/api/queries";
import type { ChainRun, ChainStepRead } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { formatDateTime } from "#/lib/format";
import { minutesToTime } from "#/lib/http-contract";
import { isScheduled } from "#/lib/list-sections";
import { tableLinkClass, textLinkClass } from "#/lib/styles";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ChainDetail({
	chainId,
	onRunStarted,
}: {
	chainId: string;
	onRunStarted: (run: ChainRun) => void;
}) {
	const chain = useChain(chainId);
	const agents = useAgents();
	const startRun = useStartChainRun(chainId);
	const sessionRuns = useQuery({
		queryKey: queryKeys.chainRuns(chainId),
		queryFn: async (): Promise<ChainRun[]> => [],
		enabled: false,
		initialData: [],
	});
	const [runInput, setRunInput] = useState("");

	if (chain.isPending) {
		return <LoadingState label="Loading chain…" />;
	}
	if (chain.isError) {
		return (
			<ErrorState
				title="Could not load chain"
				error={chain.error}
				onRetry={() => void chain.refetch()}
			/>
		);
	}

	const data = chain.data;
	const titleFor = (agentId: string) =>
		agents.data?.items.find((agent) => agent.id === agentId)?.title ?? agentId;

	const runColumns: DataTableColumn<ChainRun>[] = [
		{
			id: "status",
			accessorFn: (row) => row.status,
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "started",
			accessorFn: (row) => row.started_at,
			header: "Started",
			cell: ({ row }) => (
				<RelativeTime
					iso={row.original.started_at}
					className="text-sm text-muted-foreground"
				/>
			),
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			cell: ({ row }) => (
				<Link
					to="/chain-runs/$chainRunId"
					params={{ chainRunId: row.original.id }}
					className={tableLinkClass}
				>
					View run
				</Link>
			),
		},
	];

	return (
		<>
			<PageHeader
				title={data.title}
				description={`Created ${formatDateTime(data.created_at)}`}
				action={
					<div className="flex w-full max-w-sm flex-col items-stretch gap-2">
						<Label htmlFor="chain-run-input">Run input (optional)</Label>
						<Textarea
							id="chain-run-input"
							value={runInput}
							onChange={(event) => setRunInput(event.target.value)}
							placeholder="Becomes the first step's user message"
							rows={3}
						/>
						<Button
							type="button"
							disabled={startRun.isPending}
							onClick={() =>
								startRun.mutate(
									{ input: runInput },
									{
										onSuccess: (run) => {
											notify.success("Chain run started", {
												description: data.title,
											});
											onRunStarted(run);
										},
										onError: (error) =>
											notify.error("Could not start the chain", error),
									},
								)
							}
						>
							{startRun.isPending ? (
								<Loader2Icon className="animate-spin" aria-hidden="true" />
							) : (
								<PlayIcon aria-hidden="true" />
							)}
							{startRun.isPending ? "Starting…" : "Run chain"}
						</Button>
					</div>
				}
			/>

			{startRun.error ? (
				<Notice
					tone="danger"
					className="mb-4"
					title="Could not start the chain"
				>
					<p>{startRun.error.message}</p>
				</Notice>
			) : null}

			<div className="space-y-6">
				<Section title="Steps" contentClassName="p-0">
					<ol className="divide-y">
						{data.steps.map((step) => (
							<StepRow
								key={`${step.position}-${step.agent_id}`}
								step={step}
								title={titleFor(step.agent_id)}
							/>
						))}
					</ol>
				</Section>
				<Section title="Schedule">
					<ScheduleSummary schedule={data.schedule} />
				</Section>
				<section aria-labelledby="session-runs-heading">
					<h2 id="session-runs-heading" className="mb-3 text-sm font-medium">
						Runs this session
					</h2>
					{sessionRuns.data.length === 0 ? (
						<EmptyState
							title="No runs this session"
							description="Start a run to poll its final result. Refreshing the page clears this list."
						/>
					) : (
						<DataTable
							columns={runColumns}
							data={sessionRuns.data}
							caption="Chain runs started in this session"
						/>
					)}
				</section>
			</div>
		</>
	);
}

function StepRow({ step, title }: { step: ChainStepRead; title: string }) {
	return (
		<li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
			<span
				aria-hidden="true"
				className="flex size-6 items-center justify-center rounded-full border bg-background text-xs font-medium tabular-nums"
			>
				{step.position + 1}
			</span>
			<span className="sr-only">Step {step.position + 1}</span>
			<Link
				to="/agents/$agentId"
				params={{ agentId: step.agent_id }}
				className={textLinkClass}
			>
				{title}
			</Link>
			{step.label ? (
				<span className="text-muted-foreground">{step.label}</span>
			) : null}
		</li>
	);
}

function ScheduleSummary({
	schedule,
}: {
	schedule:
		| { month?: number | null; dayOfWeek?: number[]; timeOfDay?: number[] }
		| null
		| undefined;
}) {
	const dayOfWeek = schedule?.dayOfWeek ?? [];
	const timeOfDay = schedule?.timeOfDay ?? [];
	const month = schedule?.month;
	if (!isScheduled(schedule)) {
		return (
			<p className="text-sm text-muted-foreground">
				Not scheduled. Runs only on demand.
			</p>
		);
	}
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt className="text-muted-foreground">Days</dt>
			<dd>
				{dayOfWeek.length > 0
					? dayOfWeek.map((day) => DAY_LABELS[day]).join(", ")
					: "Any day"}
			</dd>
			<dt className="text-muted-foreground">Times</dt>
			<dd>
				{timeOfDay.length > 0
					? timeOfDay.map(minutesToTime).join(", ")
					: "Any time"}
			</dd>
			<dt className="text-muted-foreground">Month</dt>
			<dd>{month != null ? month : "Any month"}</dd>
		</dl>
	);
}
