import { Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { StatusBadge } from "#/components/status-badge";
import { ToneBadge } from "#/components/tone-badge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { useAgents } from "#/lib/api/queries";
import type { Agent } from "#/lib/api/schemas";
import { formatDateTime } from "#/lib/format";
import { buttonLinkClass, textLinkClass } from "#/lib/styles";
import { toolKey } from "#/lib/tools";

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
					className={textLinkClass}
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
		id: "tools",
		header: "Tools",
		enableSorting: false,
		cell: ({ row }) => (
			<div className="flex flex-wrap gap-1">
				{row.original.configurations.tools.map((tool) => (
					<Badge key={toolKey(tool)} variant="outline">
						{tool.kind}
					</Badge>
				))}
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
				description="Build an agent from the platform's tools and run it in an isolated container."
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
			<DataTable columns={columns} data={items} caption="Your agents" />
			{pagination && pagination.total_items > items.length ? (
				<p className="mt-3 text-sm text-muted-foreground">
					Showing {items.length} of {pagination.total_items} agents.
				</p>
			) : null}
		</>
	);
}
