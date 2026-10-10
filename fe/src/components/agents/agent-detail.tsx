import { Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import { PageHeader } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useAgent, useAgentRuns, useStartRun } from "#/lib/api/queries";
import type { Run } from "#/lib/api/schemas";
import { formatDateTime, formatDuration } from "#/lib/format";
import { textLinkClass } from "#/lib/styles";
import { toolKey } from "#/lib/tools";

export function AgentDetail({
	agentId,
	onRunStarted,
}: {
	agentId: string;
	onRunStarted: (run: Run) => void;
}) {
	const agent = useAgent(agentId);
	const startRun = useStartRun(agentId);

	if (agent.isPending) {
		return <LoadingState label="Loading agent…" />;
	}
	if (agent.isError) {
		return (
			<ErrorState
				title="Could not load agent"
				error={agent.error}
				onRetry={() => void agent.refetch()}
			/>
		);
	}

	const data = agent.data;

	return (
		<>
			<PageHeader
				title={data.name}
				description={`Created ${formatDateTime(data.created_at)}`}
				action={
					<Button
						type="button"
						disabled={startRun.isPending}
						onClick={() =>
							startRun.mutate(undefined, {
								onSuccess: (run) => onRunStarted(run),
							})
						}
					>
						{startRun.isPending ? "Starting…" : "Run agent"}
					</Button>
				}
			/>

			{data.flagged ? (
				<Notice
					tone="danger"
					className="mb-6"
					title="Flagged by the security monitor"
				>
					<p>
						A run of this agent was terminated for a policy violation. See the{" "}
						<Link to="/security" className={textLinkClass}>
							Security
						</Link>{" "}
						page for the finding.
					</p>
				</Notice>
			) : null}

			{startRun.error ? (
				<Notice tone="danger" className="mb-4" title="Could not start the run">
					<p>{startRun.error.message}</p>
				</Notice>
			) : null}

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="runs">Runs</TabsTrigger>
				</TabsList>
				<TabsContent value="overview" className="mt-4 space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Instructions</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="whitespace-pre-wrap text-sm">{data.instructions}</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Tools</CardTitle>
						</CardHeader>
						<CardContent>
							{data.tools.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									This agent has no tools.
								</p>
							) : (
								<ul className="space-y-4">
									{data.tools.map((tool) => (
										<li key={toolKey(tool)} className="space-y-2">
											<Badge variant="outline">{tool.kind}</Badge>
											<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
												{Object.entries(tool.config).map(([key, value]) => (
													<div key={key} className="contents">
														<dt className="text-muted-foreground">{key}</dt>
														<dd>
															<code>{value}</code>
														</dd>
													</div>
												))}
											</dl>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</TabsContent>
				<TabsContent value="runs" className="mt-4">
					<AgentRuns agentId={agentId} />
				</TabsContent>
			</Tabs>
		</>
	);
}

const runColumns: DataTableColumn<Run>[] = [
	{
		id: "status",
		accessorFn: (run) => run.status,
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
	},
	{
		id: "started",
		accessorFn: (run) => run.started_at ?? run.created_at,
		header: "Started",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatDateTime(row.original.started_at ?? row.original.created_at)}
			</span>
		),
	},
	{
		id: "duration",
		header: "Duration",
		enableSorting: false,
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatDuration(row.original.started_at, row.original.finished_at)}
			</span>
		),
	},
	{
		id: "actions",
		header: () => <span className="sr-only">Actions</span>,
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/runs/$runId"
				params={{ runId: row.original.id }}
				className={textLinkClass}
			>
				View
			</Link>
		),
	},
];

function AgentRuns({ agentId }: { agentId: string }) {
	const runs = useAgentRuns(agentId);

	if (runs.isPending) {
		return <LoadingState label="Loading runs…" />;
	}
	if (runs.isError) {
		return (
			<ErrorState
				title="Could not load runs"
				error={runs.error}
				onRetry={() => void runs.refetch()}
			/>
		);
	}
	if (runs.data.length === 0) {
		return (
			<EmptyState
				title="No runs yet"
				description="Start a run and it will show up here with its status and output."
			/>
		);
	}

	return (
		<DataTable
			columns={runColumns}
			data={runs.data}
			caption="Runs of this agent"
		/>
	);
}
