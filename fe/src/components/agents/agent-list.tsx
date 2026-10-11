import { Link } from "@tanstack/react-router";
import {
	FileTextIcon,
	PauseIcon,
	PlayIcon,
	Settings,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { HttpCallChip } from "#/components/http-call-chip";
import { Notice } from "#/components/notice";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { Button } from "#/components/ui/button";
import { isActiveRunStatus, useAgents, useStartRun } from "#/lib/api/queries";
import type { Agent } from "#/lib/api/schemas";
import { formatDateTime } from "#/lib/format";
import { buttonLinkClass, tableLinkClass } from "#/lib/styles";

type AgentRowAction = "start" | "stop" | "delete";

const STUB_ACTION_MS = 800;

const dataColumns: DataTableColumn<Agent>[] = [
	{
		id: "title",
		accessorFn: (agent) => agent.title,
		header: "Name",
		cell: ({ row }) => (
			<Link
				to="/agents/$agentId"
				params={{ agentId: row.original.id }}
				className={tableLinkClass}
			>
				{row.original.title}
			</Link>
		),
	},
	{
		id: "calls",
		header: "HTTP calls",
		enableSorting: false,
		meta: { cellClassName: "whitespace-normal" },
		cell: ({ row }) => (
			<div className="flex flex-wrap gap-1">
				{Object.entries(row.original.configurations.primitives).map(
					([name, contract]) => (
						<HttpCallChip key={name} method={contract.method} name={name} />
					),
				)}
			</div>
		),
	},
	{
		id: "last_run",
		accessorFn: (agent) => agent.last_run?.status ?? "",
		header: "Last run",
		cell: ({ row }) =>
			row.original.last_run ? (
				<StatusBadge status={row.original.last_run.status} />
			) : (
				<span className="text-sm text-muted-foreground">Never run</span>
			),
	},
	{
		id: "created_at",
		accessorFn: (agent) => agent.created_at,
		header: "Created",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatDateTime(row.original.created_at)}
			</span>
		),
	},
];

function isRunning(agent: Agent): boolean {
	return agent.last_run != null && isActiveRunStatus(agent.last_run.status);
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
				title="No agents yet"
				description="Describe what an agent should do, give it the HTTP calls it may make, and run it in an isolated container."
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
	const startRun = useStartRun();
	const [pendingAction, setPendingAction] = useState<{
		id: string;
		type: AgentRowAction;
	} | null>(null);
	const stubTimer = useRef<number>(undefined);

	useEffect(
		() => () => {
			window.clearTimeout(stubTimer.current);
		},
		[],
	);

	const isActionPending = (action: AgentRowAction, agentId: string) => {
		if (action === "start") {
			return startRun.isPending && startRun.variables === agentId;
		}
		return pendingAction?.id === agentId && pendingAction.type === action;
	};

	const isBusy = (agentId: string) =>
		(startRun.isPending && startRun.variables === agentId) ||
		pendingAction?.id === agentId;

	const stubAction = (agent: Agent, type: Exclude<AgentRowAction, "start">) => {
		window.clearTimeout(stubTimer.current);
		setPendingAction({ id: agent.id, type });
		stubTimer.current = window.setTimeout(() => {
			setPendingAction(null);
		}, STUB_ACTION_MS);
	};

	const columns: DataTableColumn<Agent>[] = [
		...dataColumns,
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			meta: {
				headerClassName: "w-[180px] text-right",
				cellClassName: "text-right",
			},
			cell: ({ row }) => {
				const agent = row.original;
				const busy = isBusy(agent.id);
				const running = isRunning(agent);
				return (
					<DataTableActionsCell>
						{running ? (
							<DataTableActionButton
								label="Stop"
								icon={<PauseIcon className="size-4" />}
								pending={isActionPending("stop", agent.id)}
								disabled={busy}
								onClick={() => stubAction(agent, "stop")}
							/>
						) : (
							<DataTableActionButton
								label="Start"
								icon={<PlayIcon className="size-4" />}
								pending={isActionPending("start", agent.id)}
								disabled={busy}
								onClick={() => startRun.mutate(agent.id)}
							/>
						)}
						<DataTableActionButton
							label="Edit configuration"
							icon={<Settings className="size-4" />}
							disabled={busy}
							asChild
						>
							<Link to="/agents/$agentId/edit" params={{ agentId: agent.id }} />
						</DataTableActionButton>
						<DataTableActionButton
							label="View details"
							icon={<FileTextIcon className="size-4" />}
							disabled={busy}
							asChild
						>
							<Link to="/agents/$agentId" params={{ agentId: agent.id }} />
						</DataTableActionButton>
						<DataTableActionButton
							label="Delete"
							icon={<Trash2Icon className="size-4" />}
							pending={isActionPending("delete", agent.id)}
							disabled={busy}
							destructive
							onClick={() => stubAction(agent, "delete")}
						/>
					</DataTableActionsCell>
				);
			},
		},
	];

	return (
		<>
			{startRun.error ? (
				<Notice tone="danger" className="mb-3" title="Could not start the run">
					<p>{startRun.error.message}</p>
				</Notice>
			) : null}
			<DataTable columns={columns} data={items} caption="Your agents" />
		</>
	);
}
