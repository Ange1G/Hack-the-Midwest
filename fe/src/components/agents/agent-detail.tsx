import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowLeftIcon,
	ArrowUpRightIcon,
	Loader2Icon,
	PanelRightOpenIcon,
	PlayIcon,
	SettingsIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { PageHeader, Section } from "#/components/layout/page";
import { Notice } from "#/components/notice";
import { RelativeTime } from "#/components/relative-time";
import { RunDetails } from "#/components/runs/run-details";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
	isActiveRunStatus,
	queryKeys,
	useAgent,
	useAgentRuns,
	useConnectors,
	useRun,
	useStartRun,
} from "#/lib/api/queries";
import type {
	AgentConfigurations,
	Connector,
	HttpContract,
	Run,
} from "#/lib/api/schemas";
import {
	connectorConfigRecord,
	connectorLabel,
	httpContractFromConnector,
} from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { formatDateTime, formatDuration } from "#/lib/format";
import { minutesToTime } from "#/lib/http-contract";
import { useFadeUp } from "#/lib/motion";
import { watchRun } from "#/lib/run-watch";
import { backLinkClass, textLinkClass } from "#/lib/styles";

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
	runId,
	onRunChange,
	pollIntervalMs,
}: {
	agentId: string;
	// The run shown in the panel; defaults to the most recent run.
	runId?: string;
	onRunChange?: (runId: string) => void;
	pollIntervalMs?: number;
}) {
	const agent = useAgent(agentId);
	const connectors = useConnectors();
	const runs = useAgentRuns(agentId);
	const [selectedRunId, setSelectedRunId] = useState(runId);

	useEffect(() => {
		if (runId) setSelectedRunId(runId);
	}, [runId]);

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
	const connectorById = new Map(
		(connectors.data ?? []).map((item) => [item.id, item]),
	);
	const attachments = Object.entries(data.configurations.primitives).flatMap(
		([id, reference]) => {
			const connector = connectorById.get(id);
			if (!connector) return [];
			return [{ id, connector, reference }];
		},
	);
	const shownRunId = selectedRunId ?? runs.data?.[0]?.id;
	const selectRun = (id: string) => {
		setSelectedRunId(id);
		onRunChange?.(id);
	};

	return (
		<>
			<PageHeader
				title={data.title}
				eyebrow={
					<Link to="/agents" className={backLinkClass}>
						<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
						Agents
					</Link>
				}
				meta={
					data.flagged ? <ToneBadge tone="danger">Flagged</ToneBadge> : null
				}
				description={`Created ${formatDateTime(data.created_at)}`}
				action={
					<Button variant="outline" size="sm" asChild>
						<Link to="/agents/$agentId/edit" params={{ agentId }}>
							<SettingsIcon aria-hidden="true" />
							Edit
						</Link>
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

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
				<div className="min-w-0 xl:sticky xl:top-6 xl:order-2">
					<RunPanel
						agentId={agentId}
						agentTitle={data.title}
						runId={shownRunId}
						onRunStarted={selectRun}
						pollIntervalMs={pollIntervalMs}
					/>
				</div>

				<div className="min-w-0 space-y-6 xl:order-1">
					<Section title="Instructions">
						<p className="text-sm leading-relaxed whitespace-pre-wrap">
							{data.system_prompt}
						</p>
					</Section>

					<Section
						title="Connectors"
						description={`${attachments.length} attached`}
						contentClassName="p-0"
					>
						{attachments.length === 0 ? (
							<p className="p-4 text-sm text-muted-foreground">
								This agent has no connectors.
							</p>
						) : (
							<ul className="divide-y">
								{attachments.map((item) => (
									<li key={item.id} className="px-4 py-3">
										<ConnectorSummary
											connector={item.connector}
											allowedTools={item.reference.allowedTools}
										/>
									</li>
								))}
							</ul>
						)}
					</Section>

					<Section title="Schedule">
						<ScheduleSummary configurations={data.configurations} />
					</Section>

					<AgentRuns
						runs={runs}
						selectedRunId={shownRunId}
						onSelect={selectRun}
					/>
				</div>
			</div>
		</>
	);
}

function RunPanel({
	agentId,
	agentTitle,
	runId,
	onRunStarted,
	pollIntervalMs,
}: {
	agentId: string;
	agentTitle: string;
	runId: string | undefined;
	onRunStarted: (runId: string) => void;
	pollIntervalMs?: number;
}) {
	const startRun = useStartRun(agentId);
	const [runInput, setRunInput] = useState("");
	const fadeUp = useFadeUp();
	const hintId = useId();

	const start = () => {
		if (startRun.isPending) return;
		startRun.mutate(
			{ input: runInput },
			{
				onSuccess: (run) => {
					setRunInput("");
					onRunStarted(run.id);
					notify.success("Run started", { description: agentTitle });
				},
				onError: (error) => notify.error("Could not start the run", error),
			},
		);
	};

	return (
		<section
			aria-label="Run panel"
			className="overflow-hidden rounded-lg border bg-card"
		>
			<form
				className="space-y-2 border-b p-4"
				onSubmit={(event) => {
					event.preventDefault();
					start();
				}}
			>
				<Label htmlFor="run-input">Run input (optional)</Label>
				<Textarea
					id="run-input"
					value={runInput}
					onChange={(event) => setRunInput(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							start();
						}
					}}
					placeholder="Passed to the agent as this run's user message"
					aria-describedby={hintId}
					rows={3}
					className="resize-none"
				/>
				<div className="flex items-center justify-between gap-2">
					<p id={hintId} className="text-xs text-muted-foreground">
						<kbd className="font-sans">Ctrl</kbd> /{" "}
						<kbd className="font-sans">⌘</kbd> +{" "}
						<kbd className="font-sans">Enter</kbd> to run
					</p>
					<Button type="submit" size="sm" disabled={startRun.isPending}>
						{startRun.isPending ? (
							<Loader2Icon className="animate-spin" aria-hidden="true" />
						) : (
							<PlayIcon aria-hidden="true" />
						)}
						{startRun.isPending ? "Starting…" : "Run agent"}
					</Button>
				</div>
				{startRun.error ? (
					<Notice tone="danger" title="Could not start the run">
						<p>{startRun.error.message}</p>
					</Notice>
				) : null}
			</form>

			<div className="p-4">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={runId ?? "none"}
						variants={fadeUp}
						initial="hidden"
						animate="visible"
						exit="exit"
					>
						{runId ? (
							<PanelRun runId={runId} pollIntervalMs={pollIntervalMs} />
						) : (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No runs yet. Start one and its output appears here.
							</p>
						)}
					</motion.div>
				</AnimatePresence>
			</div>
		</section>
	);
}

function PanelRun({
	runId,
	pollIntervalMs,
}: {
	runId: string;
	pollIntervalMs?: number;
}) {
	const queryClient = useQueryClient();
	const run = useRun(runId, { pollIntervalMs });
	const data = run.data;

	useEffect(() => {
		if (!data) return;
		if (isActiveRunStatus(data.status)) watchRun(data.id);
		// Keep the history table's row in step with the polled run.
		queryClient.setQueryData<Run[]>(
			queryKeys.agentRuns(data.agent_id),
			(list) => list?.map((item) => (item.id === data.id ? data : item)),
		);
	}, [data, queryClient]);

	if (run.isPending) {
		return (
			<p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
				<Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
				Loading run…
			</p>
		);
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
	return (
		<RunDetails
			run={run.data}
			actions={
				<Button variant="ghost" size="xs" asChild>
					<Link to="/runs/$runId" params={{ runId }}>
						Open
						<ArrowUpRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		/>
	);
}

function ConnectorSummary({
	connector,
	allowedTools,
}: {
	connector: Connector;
	allowedTools?: string[];
}) {
	const http = httpContractFromConnector(connector);
	if (http) {
		return <CallSummary name={connector.name} contract={http} />;
	}
	const config = connectorConfigRecord(connector);
	return (
		<ConnectorRow name={connector.name}>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<ToneBadge tone="info">{connectorLabel(connector.type)}</ToneBadge>
				{typeof config.URL === "string" ? (
					<code className="break-all">{config.URL}</code>
				) : null}
				{typeof config.engine === "string" ? (
					<span>{String(config.engine)}</span>
				) : null}
				{typeof config.host === "string" ? (
					<code className="break-all">{config.host}</code>
				) : null}
				{typeof config.mode === "string" ? (
					<span className="text-muted-foreground">{config.mode}</span>
				) : null}
			</div>
			{allowedTools && allowedTools.length > 0 ? (
				<p className="text-xs text-muted-foreground">
					Allowed tools:{" "}
					<span className="font-mono text-foreground">
						{allowedTools.join(", ")}
					</span>
				</p>
			) : null}
		</ConnectorRow>
	);
}

function ConnectorRow({
	name,
	children,
}: {
	name: string;
	children: ReactNode;
}) {
	return (
		<fieldset className="min-w-0 space-y-2">
			<legend className="mb-2 font-mono text-sm font-medium">{name}</legend>
			{children}
		</fieldset>
	);
}

function CallSummary({
	name,
	contract,
}: {
	name: string;
	contract: HttpContract;
}) {
	const details: string[] = [
		contract.xApiKey ? "API key: configured" : "API key: none",
		contract.authorizationHeader
			? "Authorization header: configured"
			: "Authorization header: none",
	];
	if (contract.options?.retries != null) {
		details.push(`${contract.options.retries} retries`);
	}
	if (contract.options?.timeout != null) {
		details.push(`${contract.options.timeout} ms timeout`);
	}
	return (
		<ConnectorRow name={name}>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<ToneBadge tone={contract.method === "POST" ? "info" : "neutral"}>
					{contract.method}
				</ToneBadge>
				<code className="break-all">{contract.URL}</code>
			</div>
			{contract.payload !== undefined ? (
				<pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
					{JSON.stringify(contract.payload, null, 2)}
				</pre>
			) : null}
			<ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
				{details.map((detail) => (
					<li key={detail}>{detail}</li>
				))}
			</ul>
		</ConnectorRow>
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
		<dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
			<dt className="text-muted-foreground">Days</dt>
			<dd>
				{dayOfWeek.length > 0
					? dayOfWeek.map((day) => DAY_LABELS[day]).join(", ")
					: "Any day"}
			</dd>
			<dt className="text-muted-foreground">Times</dt>
			<dd className="tabular-nums">
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

function AgentRuns({
	runs,
	selectedRunId,
	onSelect,
}: {
	runs: ReturnType<typeof useAgentRuns>;
	selectedRunId: string | undefined;
	onSelect: (runId: string) => void;
}) {
	const columns: DataTableColumn<Run>[] = [
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
				<RelativeTime
					iso={row.original.started_at ?? row.original.created_at}
					className="text-sm text-muted-foreground"
				/>
			),
		},
		{
			id: "duration",
			header: "Duration",
			enableSorting: false,
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground tabular-nums">
					{formatDuration(row.original.started_at, row.original.finished_at) ||
						"—"}
				</span>
			),
		},
		{
			id: "actions",
			header: () => <span className="sr-only">Actions</span>,
			enableSorting: false,
			meta: {
				headerClassName: "w-[96px] text-right",
				cellClassName: "text-right",
			},
			cell: ({ row }) => (
				<DataTableActionsCell>
					<DataTableActionButton
						label="Show output"
						icon={<PanelRightOpenIcon className="size-4" />}
						onClick={() => onSelect(row.original.id)}
					/>
					<DataTableActionButton
						label="View run"
						icon={<ArrowUpRightIcon className="size-4" />}
						asChild
					>
						<Link to="/runs/$runId" params={{ runId: row.original.id }} />
					</DataTableActionButton>
				</DataTableActionsCell>
			),
		},
	];

	return (
		<section aria-labelledby="agent-runs-heading" className="space-y-3">
			<h2 id="agent-runs-heading" className="text-sm font-medium">
				Runs
			</h2>
			{runs.isPending ? (
				<LoadingState label="Loading runs…" />
			) : runs.isError ? (
				<ErrorState
					title="Could not load runs"
					error={runs.error}
					onRetry={() => void runs.refetch()}
				/>
			) : runs.data.length === 0 ? (
				<EmptyState
					title="No runs yet"
					description="Start a run and it will show up here with its status and output."
				/>
			) : (
				<DataTable
					columns={columns}
					data={runs.data}
					caption="Runs of this agent"
					density="compact"
					onRowClick={(run) => onSelect(run.id)}
					isRowSelected={(run) => run.id === selectedRunId}
				/>
			)}
		</section>
	);
}
