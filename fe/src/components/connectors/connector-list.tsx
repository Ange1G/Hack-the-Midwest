import { Link } from "@tanstack/react-router";
import {
	DatabaseIcon,
	GlobeIcon,
	type LucideIcon,
	PlugIcon,
	ServerIcon,
} from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import { ListSection } from "#/components/list/list-section";
import { RelativeTime } from "#/components/relative-time";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { useConnectors } from "#/lib/api/queries";
import {
	type Connector,
	type ConnectorType,
	connectorConfigRecord,
	connectorLabel,
} from "#/lib/api/schemas";
import { buttonLinkClass } from "#/lib/styles";
import { cn } from "#/lib/utils";

const TYPE_CARDS: {
	type: ConnectorType;
	icon: LucideIcon;
	description: string;
}[] = [
	{ type: "http", icon: GlobeIcon, description: "GET and POST endpoints" },
	{ type: "mcp", icon: ServerIcon, description: "Tools from your MCP servers" },
	{ type: "database", icon: DatabaseIcon, description: "Database connections" },
];

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

	return <ConnectorSections connectors={connectors.data} />;
}

function ConnectorSections({ connectors }: { connectors: Connector[] }) {
	const [filter, setFilter] = useState<ConnectorType | null>(null);
	const shown = filter
		? connectors.filter((connector) => connector.type === filter)
		: connectors;
	const filterLabel = filter ? connectorLabel(filter) : null;

	return (
		<div className="space-y-10">
			<ListSection
				title="By type"
				description="Pick a type to filter the list below."
				action={
					filter ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setFilter(null)}
						>
							Clear filter
						</Button>
					) : null
				}
			>
				<ul className="grid gap-3 sm:grid-cols-3">
					{TYPE_CARDS.map(({ type, icon: Icon, description }) => {
						const count = connectors.filter(
							(connector) => connector.type === type,
						).length;
						const active = filter === type;
						return (
							<li key={type}>
								<button
									type="button"
									aria-pressed={active}
									aria-label={`${connectorLabel(type)} connectors (${count})`}
									onClick={() => setFilter(active ? null : type)}
									className={cn(
										"flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 text-left outline-none transition-[border-color,box-shadow] duration-150",
										"hover:border-foreground/20 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
										"motion-safe:active:scale-[0.99]",
										active && "border-foreground ring-1 ring-foreground",
									)}
								>
									<span
										aria-hidden="true"
										className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground"
									>
										<Icon className="size-4" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-baseline justify-between gap-2">
											<span className="text-sm font-medium">
												{connectorLabel(type)}
											</span>
											<span className="text-lg font-semibold tracking-tight tabular-nums">
												{count}
											</span>
										</span>
										<span className="block text-xs text-muted-foreground">
											{description}
										</span>
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</ListSection>
			<ListSection
				title={filterLabel ? `${filterLabel} connectors` : "All connectors"}
				count={shown.length}
			>
				<DataTable
					columns={columns}
					data={shown}
					caption="Your connectors"
					density="compact"
					emptyMessage={
						filterLabel ? `No ${filterLabel} connectors yet.` : undefined
					}
				/>
			</ListSection>
		</div>
	);
}
