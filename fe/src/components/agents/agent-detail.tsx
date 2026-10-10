import { Link } from "@tanstack/react-router";
import { PageHeader } from "#/components/layout/page";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useAgent, useAgentRuns, useStartRun } from "#/lib/api/queries";
import type { Run } from "#/lib/api/schemas";
import { formatDateTime, formatDuration } from "#/lib/format";
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
				<Alert variant="destructive" className="mb-6">
					<AlertTitle>Flagged by the security monitor</AlertTitle>
					<AlertDescription>
						A run of this agent was terminated for a policy violation. See the{" "}
						<Link to="/security">Security</Link> page for the finding.
					</AlertDescription>
				</Alert>
			) : null}

			{startRun.error ? (
				<p role="alert" className="mb-4 text-sm text-destructive">
					{startRun.error.message}
				</p>
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
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Status</TableHead>
					<TableHead>Started</TableHead>
					<TableHead>Duration</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{runs.data.map((run) => (
					<TableRow key={run.id}>
						<TableCell>
							<StatusBadge status={run.status} />
						</TableCell>
						<TableCell className="text-sm text-muted-foreground">
							{formatDateTime(run.started_at ?? run.created_at)}
						</TableCell>
						<TableCell className="text-sm text-muted-foreground">
							{formatDuration(run.started_at, run.finished_at)}
						</TableCell>
						<TableCell className="text-right">
							<Link to="/runs/$runId" params={{ runId: run.id }}>
								View
							</Link>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
