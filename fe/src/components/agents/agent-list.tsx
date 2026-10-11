import { Link, useNavigate } from "@tanstack/react-router";
import {
	BotIcon,
	PauseIcon,
	PlayIcon,
	Settings,
	Trash2Icon,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { HttpCallChip } from "#/components/http-call-chip";
import { RelativeTime } from "#/components/relative-time";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import {
	isActiveRunStatus,
	useAgents,
	useConnectors,
	useExecutions,
	useStartRun,
} from "#/lib/api/queries";
import type { Agent, Connector, Execution } from "#/lib/api/schemas";
import { connectorLabel, httpContractFromConnector } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { buttonLinkClass, tableLinkClass } from "#/lib/styles";

function lastExecutionFor(
	agentId: string,
	executions: Execution[],
	fallback: Agent["last_run"],
): Agent["last_run"] {
	const match = executions
		.filter((item) => item.agent_id === agentId)
		.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
	if (match) {
		return {
			id: match.id,
			status: match.status,
			created_at: match.created_at,
		};
	}
	return fallback;
}

function connectorChipsForAgent(agent: Agent, connectors: Connector[]) {
	const byId = new Map(connectors.map((item) => [item.id, item]));
	return Object.keys(agent.configurations.primitives).flatMap((id) => {
		const connector = byId.get(id);
		if (!connector) return [];
		const contract = httpContractFromConnector(connector);
		if (contract) {
			return [
				<HttpCallChip
					key={id}
					method={contract.method}
					name={connector.name}
				/>,
			];
		}
		return [
			<ToneBadge key={id} tone="info">
				{connectorLabel(connector.type)} {connector.name}
			</ToneBadge>,
		];
	});
}

function dataColumns(
	connectors: Connector[],
	executions: Execution[],
): DataTableColumn<Agent>[] {
	return [
		{
			id: "title",
			accessorFn: (agent) => agent.title,
			header: "Name",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<Link
						to="/agents/$agentId"
						params={{ agentId: row.original.id }}
						className={tableLinkClass}
					>
						{row.original.title}
					</Link>
					{row.original.flagged ? (
						<ToneBadge tone="danger">Flagged</ToneBadge>
					) : null}
				</div>
			),
		},
		{
			id: "calls",
			header: "Connectors",
			enableSorting: false,
			meta: { cellClassName: "whitespace-normal" },
			cell: ({ row }) => {
				const chips = connectorChipsForAgent(row.original, connectors);
				return chips.length > 0 ? (
					<div className="flex flex-wrap gap-1">{chips}</div>
				) : (
					<span className="text-sm text-muted-foreground">—</span>
				);
			},
		},
		{
			id: "last_run",
			accessorFn: (agent) =>
				lastExecutionFor(agent.id, executions, agent.last_run)?.status ?? "",
			header: "Last run",
			cell: ({ row }) => {
				const last = lastExecutionFor(
					row.original.id,
					executions,
					row.original.last_run,
				);
				return last ? (
					<div className="flex items-center gap-2">
						<StatusBadge status={last.status} />
						<RelativeTime
							iso={last.created_at}
							className="text-xs text-muted-foreground"
						/>
					</div>
				) : (
					<span className="text-sm text-muted-foreground">Never run</span>
				);
			},
		},
		{
			id: "created_at",
			accessorFn: (agent) => agent.created_at,
			header: "Created",
			cell: ({ row }) => (
				<RelativeTime
					iso={row.original.created_at}
					className="text-sm text-muted-foreground"
				/>
			),
		},
	];
}

function isRunning(agent: Agent, executions: Execution[]): boolean {
	const last = lastExecutionFor(agent.id, executions, agent.last_run);
	return last != null && isActiveRunStatus(last.status);
}

export function AgentList() {
	const agents = useAgents();

	if (agents.isPending) {
		return <LoadingState label="Loading agents…" />;
	}

	if (agents.isError) {
		return (
			<ErrorState
				title="Could not load agents"
				error={agents.error}
				onRetry={() => void agents.refetch()}
			/>
		);
	}

	const { items, pagination } = agents.data;

	if (items.length === 0) {
		return (
			<EmptyState
				icon={<BotIcon />}
				title="No agents yet"
				description="Describe what an agent should do, add HTTP, MCP, or database tools, and run it in an isolated container."
				action={
					<Button asChild>
						<Link to="/agents/new" className={buttonLinkClass}>
							Create your first agent
						</Link>
					</Button>
				}
			/>
		);
	}

	return (
		<>
			<AgentListTable items={items} />
			{pagination && pagination.total_items > items.length ? (
				<p className="mt-3 text-sm text-muted-foreground">
					Showing {items.length} of {pagination.total_items} agents.
				</p>
			) : null}
		</>
	);
}

function AgentListTable({ items }: { items: Agent[] }) {
	const navigate = useNavigate();
	const connectors = useConnectors();
	const executions = useExecutions();
	const startRun = useStartRun();

	const start = (agent: Agent) =>
		startRun.mutate(agent.id, {
			onSuccess: (run) =>
				notify.success("Run started", {
					description: agent.title,
					action: {
						label: "View",
						onClick: () =>
							void navigate({
								to: "/agents/$agentId",
								params: { agentId: agent.id },
								search: { run: run.id },
							}),
					},
				}),
			onError: (error) => notify.error("Could not start the run", error),
		});

	const columns: DataTableColumn<Agent>[] = [
		...dataColumns(connectors.data ?? [], executions.data ?? []),
		{
			id: "actions",
			header: () => <span className="sr-only">Actions</span>,
			enableSorting: false,
			meta: {
				headerClassName: "w-[132px] text-right",
				cellClassName: "text-right",
			},
			cell: ({ row }) => {
				const agent = row.original;
				const starting = startRun.isPending && startRun.variables === agent.id;
				const running = isRunning(agent, executions.data ?? []);
				return (
					<DataTableActionsCell>
						{running ? (
							<DataTableActionButton
								label="Stop"
								icon={<PauseIcon className="size-4" />}
								onClick={() =>
									notify.info("Stopping a run is not available yet", {
										description: "The run will finish or time out on its own.",
									})
								}
							/>
						) : (
							<DataTableActionButton
								label="Start"
								icon={<PlayIcon className="size-4" />}
								pending={starting}
								onClick={() => start(agent)}
							/>
						)}
						<DataTableActionButton
							label="Edit configuration"
							icon={<Settings className="size-4" />}
							disabled={starting}
							asChild
						>
							<Link to="/agents/$agentId/edit" params={{ agentId: agent.id }} />
						</DataTableActionButton>
						<DataTableActionButton
							label="Delete"
							icon={<Trash2Icon className="size-4" />}
							disabled={starting}
							destructive
							onClick={() =>
								notify.info("Deleting agents is not available yet")
							}
						/>
					</DataTableActionsCell>
				);
			},
		},
	];

	return (
		<DataTable
			columns={columns}
			data={items}
			caption="Your agents"
			onRowClick={(agent) =>
				void navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })
			}
		/>
	);
}
