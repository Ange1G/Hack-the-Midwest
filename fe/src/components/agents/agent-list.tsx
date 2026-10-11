import { Link, useNavigate } from "@tanstack/react-router";
import {
	BotIcon,
	Loader2Icon,
	PauseIcon,
	PlayIcon,
	Settings,
	ShieldAlertIcon,
	Trash2Icon,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { HttpCallChip } from "#/components/http-call-chip";
import { CardGrid, CardGridItem } from "#/components/list/card-grid";
import { ListSection } from "#/components/list/list-section";
import {
	cardLinkProps,
	ResourceCard,
	ResourceCardActions,
	ResourceCardBody,
	ResourceCardFooter,
	ResourceCardHeader,
	ResourceCardIcon,
	ResourceCardTitle,
} from "#/components/list/resource-card";
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
import {
	flaggedAgents,
	lastRunFor,
	recentlyRanAgents,
} from "#/lib/list-sections";
import { buttonLinkClass, tableLinkClass } from "#/lib/styles";

const CARD_LIMIT = 3;
const CARD_CHIP_LIMIT = 3;

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

function isRunning(agent: Agent, executions: Execution[]): boolean {
	const last = lastRunFor(agent, executions);
	return last != null && isActiveRunStatus(last.status);
}

const announceStopUnavailable = () =>
	notify.info("Stopping a run is not available yet", {
		description: "The run will finish or time out on its own.",
	});

const announceDeleteUnavailable = () =>
	notify.info("Deleting agents is not available yet");

// One start mutation shared by cards and table rows, so a run started from
// either place shows as pending in both.
function useAgentRunAction() {
	const navigate = useNavigate();
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

	const isStarting = (agent: Agent) =>
		startRun.isPending && startRun.variables === agent.id;

	return { start, isStarting };
}

type RunAction = ReturnType<typeof useAgentRunAction>;

export function AgentList() {
	const agents = useAgents();
	const connectors = useConnectors();
	const executions = useExecutions();
	const runAction = useAgentRunAction();

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

	const connectorItems = connectors.data ?? [];
	const executionItems = executions.data ?? [];
	const attention = flaggedAgents(items, CARD_LIMIT);
	const recent = recentlyRanAgents(items, executionItems, {
		limit: CARD_LIMIT,
		exclude: (agent) => agent.flagged,
	});

	const cards = (list: Agent[]) => (
		<CardGrid>
			{list.map((agent) => (
				<CardGridItem key={agent.id}>
					<AgentCard
						agent={agent}
						connectors={connectorItems}
						executions={executionItems}
						runAction={runAction}
					/>
				</CardGridItem>
			))}
		</CardGrid>
	);

	return (
		<div className="space-y-10">
			{attention.length > 0 ? (
				<ListSection
					title="Needs attention"
					description="Flagged by the security monitor. Review their runs before running them again."
				>
					{cards(attention)}
				</ListSection>
			) : null}
			{recent.length > 0 ? (
				<ListSection
					title="Recently ran"
					description="Open a card to see its latest output."
				>
					{cards(recent)}
				</ListSection>
			) : null}
			<ListSection
				title="My agents"
				count={pagination?.total_items ?? items.length}
			>
				<AgentListTable
					items={items}
					connectors={connectorItems}
					executions={executionItems}
					runAction={runAction}
				/>
				{pagination && pagination.total_items > items.length ? (
					<p className="text-sm text-muted-foreground">
						Showing {items.length} of {pagination.total_items} agents.
					</p>
				) : null}
			</ListSection>
		</div>
	);
}

function RunControl({
	agent,
	executions,
	runAction,
}: {
	agent: Agent;
	executions: Execution[];
	runAction: RunAction;
}) {
	const starting = runAction.isStarting(agent);
	if (isRunning(agent, executions)) {
		return (
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-label={`Stop ${agent.title}`}
				onClick={announceStopUnavailable}
			>
				<PauseIcon aria-hidden="true" />
				Stop
			</Button>
		);
	}
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			disabled={starting}
			aria-label={`Run ${agent.title}`}
			onClick={() => runAction.start(agent)}
		>
			{starting ? (
				<Loader2Icon className="animate-spin" aria-hidden="true" />
			) : (
				<PlayIcon aria-hidden="true" />
			)}
			Run
		</Button>
	);
}

function AgentCard({
	agent,
	connectors,
	executions,
	runAction,
}: {
	agent: Agent;
	connectors: Connector[];
	executions: Execution[];
	runAction: RunAction;
}) {
	const last = lastRunFor(agent, executions);
	const chips = connectorChipsForAgent(agent, connectors);
	const hiddenChips = chips.length - CARD_CHIP_LIMIT;

	return (
		<ResourceCard tone={agent.flagged ? "danger" : "default"}>
			<ResourceCardHeader>
				<ResourceCardIcon>
					{agent.flagged ? <ShieldAlertIcon /> : <BotIcon />}
				</ResourceCardIcon>
				<ResourceCardTitle>
					<Link
						to="/agents/$agentId"
						params={{ agentId: agent.id }}
						search={{ run: last?.id }}
						{...cardLinkProps}
					>
						{agent.title}
					</Link>
				</ResourceCardTitle>
				<ResourceCardActions>
					<DataTableActionButton
						label={`Edit ${agent.title}`}
						icon={<Settings className="size-4" />}
						asChild
					>
						<Link to="/agents/$agentId/edit" params={{ agentId: agent.id }} />
					</DataTableActionButton>
					<DataTableActionButton
						label={`Delete ${agent.title}`}
						icon={<Trash2Icon className="size-4" />}
						destructive
						onClick={announceDeleteUnavailable}
					/>
				</ResourceCardActions>
			</ResourceCardHeader>
			<ResourceCardBody>
				{agent.system_prompt ? (
					<p className="line-clamp-2 text-muted-foreground">
						{agent.system_prompt}
					</p>
				) : null}
				{chips.length > 0 ? (
					<div className="flex flex-wrap gap-1">
						{chips.slice(0, CARD_CHIP_LIMIT)}
						{hiddenChips > 0 ? (
							<span className="self-center text-xs text-muted-foreground">
								+{hiddenChips} more
							</span>
						) : null}
					</div>
				) : null}
			</ResourceCardBody>
			<ResourceCardFooter>
				<div className="flex min-w-0 items-center gap-2">
					{last ? (
						<>
							<StatusBadge status={last.status} />
							<RelativeTime
								iso={last.created_at}
								className="truncate text-xs text-muted-foreground"
							/>
						</>
					) : (
						<span className="text-xs text-muted-foreground">Never run</span>
					)}
				</div>
				<RunControl
					agent={agent}
					executions={executions}
					runAction={runAction}
				/>
			</ResourceCardFooter>
		</ResourceCard>
	);
}

function AgentListTable({
	items,
	connectors,
	executions,
	runAction,
}: {
	items: Agent[];
	connectors: Connector[];
	executions: Execution[];
	runAction: RunAction;
}) {
	const navigate = useNavigate();

	const columns: DataTableColumn<Agent>[] = [
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
			accessorFn: (agent) => lastRunFor(agent, executions)?.status ?? "",
			header: "Last run",
			cell: ({ row }) => {
				const last = lastRunFor(row.original, executions);
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
				const starting = runAction.isStarting(agent);
				return (
					<DataTableActionsCell>
						{isRunning(agent, executions) ? (
							<DataTableActionButton
								label="Stop"
								icon={<PauseIcon className="size-4" />}
								onClick={announceStopUnavailable}
							/>
						) : (
							<DataTableActionButton
								label="Start"
								icon={<PlayIcon className="size-4" />}
								pending={starting}
								onClick={() => runAction.start(agent)}
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
							onClick={announceDeleteUnavailable}
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
			density="compact"
			onRowClick={(agent) =>
				void navigate({ to: "/agents/$agentId", params: { agentId: agent.id } })
			}
		/>
	);
}
