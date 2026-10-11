import { Link } from "@tanstack/react-router";
import { FileTextIcon, PauseIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { PageHeader } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
	isActiveRunStatus,
	useAgent,
	useAgentRuns,
	useStartRun,
} from "#/lib/api/queries";
import type { AgentConfigurations, HttpContract, Run } from "#/lib/api/schemas";
import { formatDateTime, formatDuration } from "#/lib/format";
import { minutesToTime } from "#/lib/http-contract";

// shadcn renders an inactive tab at 60% of --foreground, which is 4.1:1 on the
// muted tab background with this palette; 80% keeps the resting state visibly
// quieter while clearing the WCAG AA 4.5:1 ratio.
const tabTriggerClass = "data-[state=inactive]:text-foreground/80";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

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
	const calls = Object.entries(data.configurations.primitives);

	return (
		<>
			<PageHeader
				title={data.title}
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

			{startRun.error ? (
				<Notice tone="danger" className="mb-4" title="Could not start the run">
					<p>{startRun.error.message}</p>
				</Notice>
			) : null}

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview" className={tabTriggerClass}>
						Overview
					</TabsTrigger>
					<TabsTrigger value="runs" className={tabTriggerClass}>
						Runs
					</TabsTrigger>
				</TabsList>
				<TabsContent value="overview" className="mt-4 space-y-6">
					<Card className="island-shell">
						<CardHeader>
							<CardTitle>Instructions</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="whitespace-pre-wrap text-sm">
								{data.system_prompt}
							</p>
						</CardContent>
					</Card>
					<Card className="island-shell">
						<CardHeader>
							<CardTitle>HTTP calls</CardTitle>
						</CardHeader>
						<CardContent>
							{calls.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									This agent has no HTTP calls.
								</p>
							) : (
								<ul className="space-y-4">
									{calls.map(([name, contract]) => (
										<li key={name}>
											<CallSummary name={name} contract={contract} />
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
					<Card className="island-shell">
						<CardHeader>
							<CardTitle>Schedule</CardTitle>
						</CardHeader>
						<CardContent>
							<ScheduleSummary configurations={data.configurations} />
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

function CallSummary({
	name,
	contract,
}: {
	name: string;
	contract: HttpContract;
}) {
	const details: string[] = [];
	if (contract.options?.retries != null) {
		details.push(`${contract.options.retries} retries`);
	}
	if (contract.options?.timeout != null) {
		details.push(`${contract.options.timeout} ms timeout`);
	}
	return (
		<fieldset className="space-y-2 rounded-lg border border-(--line) p-3">
			<legend className="px-1 font-mono text-sm font-medium">{name}</legend>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<ToneBadge tone={contract.method === "POST" ? "info" : "neutral"}>
					{contract.method}
				</ToneBadge>
				<code className="break-all">{contract.URL}</code>
			</div>
			{contract.payload !== undefined ? (
				<pre className="overflow-x-auto rounded-md bg-(--sand) p-2 text-xs">
					{JSON.stringify(contract.payload, null, 2)}
				</pre>
			) : null}
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt className="text-muted-foreground">API key</dt>
				<dd>
					<p>{contract.xApiKey ? "API key: configured" : "API key: none"}</p>
				</dd>
				<dt className="text-muted-foreground">Authorization</dt>
				<dd>
					<p>
						{contract.authorizationHeader
							? "Authorization header: configured"
							: "Authorization header: none"}
					</p>
				</dd>
			</dl>
			{details.length > 0 ? (
				<p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
			) : null}
		</fieldset>
	);
}

function ScheduleSummary({
	configurations,
}: {
	configurations: AgentConfigurations;
}) {
	const { dayOfWeek, timeOfDay, month } = configurations;
	if (dayOfWeek.length === 0 && timeOfDay.length === 0 && month == null) {
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
			<dd>
				{month != null ? (MONTH_LABELS[month - 1] ?? month) : "Any month"}
			</dd>
		</dl>
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
		header: "Actions",
		enableSorting: false,
		meta: {
			headerClassName: "w-[120px] text-right",
			cellClassName: "text-right",
		},
		cell: ({ row }) => <RunActions run={row.original} />,
	},
];

function RunActions({ run }: { run: Run }) {
	const [pending, setPending] = useState(false);
	const timer = useRef<number>(undefined);
	useEffect(
		() => () => {
			window.clearTimeout(timer.current);
		},
		[],
	);

	return (
		<DataTableActionsCell>
			{isActiveRunStatus(run.status) ? (
				<DataTableActionButton
					label="Stop"
					icon={<PauseIcon className="size-4" />}
					pending={pending}
					disabled={pending}
					onClick={() => {
						window.clearTimeout(timer.current);
						setPending(true);
						timer.current = window.setTimeout(() => setPending(false), 800);
					}}
				/>
			) : null}
			<DataTableActionButton
				label="View run"
				icon={<FileTextIcon className="size-4" />}
				disabled={pending}
				asChild
			>
				<Link to="/runs/$runId" params={{ runId: run.id }} />
			</DataTableActionButton>
		</DataTableActionsCell>
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
		<DataTable
			columns={runColumns}
			data={runs.data}
			caption="Runs of this agent"
		/>
	);
}
