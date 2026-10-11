import { Link } from "@tanstack/react-router";
import { PlugIcon } from "lucide-react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import { RelativeTime } from "#/components/relative-time";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { useConnectors } from "#/lib/api/queries";
import {
	type Connector,
	connectorConfigRecord,
	connectorLabel,
} from "#/lib/api/schemas";
import { buttonLinkClass } from "#/lib/styles";

// The non-secret address a connector points at, for scanning the list.
function connectorTarget(connector: Connector): string | null {
	const config = connectorConfigRecord(connector);
	for (const key of ["URL", "url", "host"]) {
		const value = config[key];
		if (typeof value === "string" && value) return value;
	}
	return null;
}

const columns: DataTableColumn<Connector>[] = [
	{
		id: "name",
		accessorFn: (row) => row.name,
		header: "Name",
		cell: ({ row }) => (
			<span className="font-mono text-sm font-medium">{row.original.name}</span>
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
		id: "target",
		header: "Target",
		enableSorting: false,
		meta: { cellClassName: "max-w-xs" },
		cell: ({ row }) => {
			const target = connectorTarget(row.original);
			return target ? (
				<span
					className="block truncate font-mono text-xs text-muted-foreground"
					title={target}
				>
					{target}
				</span>
			) : (
				<span className="text-sm text-muted-foreground">—</span>
			);
		},
	},
	{
		id: "created",
		accessorFn: (row) => row.created_at,
		header: "Created",
		cell: ({ row }) => (
			<RelativeTime
				iso={row.original.created_at}
				className="text-sm text-muted-foreground"
			/>
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
				icon={<PlugIcon />}
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
			density="compact"
		/>
	);
}
