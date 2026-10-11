import { Link } from "@tanstack/react-router";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { useConnectors } from "#/lib/api/queries";
import { type Connector, connectorLabel } from "#/lib/api/schemas";
import { formatDateTime } from "#/lib/format";
import { buttonLinkClass } from "#/lib/styles";

const columns: DataTableColumn<Connector>[] = [
	{
		id: "name",
		accessorFn: (row) => row.name,
		header: "Name",
		cell: ({ row }) => (
			<span className="font-mono text-sm">{row.original.name}</span>
		),
	},
	{
		id: "type",
		accessorFn: (row) => row.type,
		header: "Type",
		cell: ({ row }) => (
			<ToneBadge tone={row.original.type === "http" ? "neutral" : "info"}>
				{connectorLabel(row.original.type)}
			</ToneBadge>
		),
	},
	{
		id: "created",
		accessorFn: (row) => row.created_at,
		header: "Created",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{formatDateTime(row.original.created_at)}
			</span>
		),
	},
];

export function ConnectorList() {
	const connectors = useConnectors();

	if (connectors.isPending) {
		return <LoadingState label="Loading connectors…" />;
	}
	if (connectors.isError) {
		return (
			<ErrorState
				title="Could not load connectors"
				error={connectors.error}
				onRetry={() => void connectors.refetch()}
			/>
		);
	}
	if (connectors.data.length === 0) {
		return (
			<EmptyState
				title="No connectors yet"
				description="Create an HTTP, MCP, or database connector, then attach it to an agent."
				action={
					<Button asChild>
						<Link to="/connectors/new" className={buttonLinkClass}>
							New connector
						</Link>
					</Button>
				}
			/>
		);
	}

	return (
		<DataTable
			columns={columns}
			data={connectors.data}
			caption="Your connectors"
		/>
	);
}
