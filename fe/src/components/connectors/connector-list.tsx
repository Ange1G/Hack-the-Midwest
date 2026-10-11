import { Link } from "@tanstack/react-router";
import {
	BellIcon,
	BookOpenIcon,
	DatabaseIcon,
	FileTextIcon,
	GlobeIcon,
	type LucideIcon,
	PlugIcon,
	ServerIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { ListSection } from "#/components/list/list-section";
import { RelativeTime } from "#/components/relative-time";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { ToneBadge } from "#/components/tone-badge";
import { Button } from "#/components/ui/button";
import { useConnectors, useDeleteConnector } from "#/lib/api/queries";
import {
	type Connector,
	type ConnectorType,
	connectorConfigRecord,
	connectorLabel,
} from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
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
	{
		type: "notification",
		icon: BellIcon,
		description: "Slack webhooks, pagers, alerts",
	},
	{
		type: "knowledge",
		icon: BookOpenIcon,
		description: "Documents agents can search",
	},
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

const baseColumns: DataTableColumn<Connector>[] = [
	{
		id: "name",
		accessorFn: (row) => row.name,
		header: "Name",
		cell: ({ row }) => (
			<Link
				to="/connectors/$connectorId"
				params={{ connectorId: row.original.id }}
				className="rounded-sm font-mono text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
			>
				{row.original.name}
			</Link>
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
				description="Install an integration above, or create an HTTP, MCP, database, or knowledge connector, then attach it to an agent."
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
	const deleteConnector = useDeleteConnector();
	const shown = filter
		? connectors.filter((connector) => connector.type === filter)
		: connectors;
	const filterLabel = filter ? connectorLabel(filter) : null;

	const isDeleting = (connector: Connector) =>
		deleteConnector.isPending && deleteConnector.variables === connector.id;

	const remove = (connector: Connector) =>
		deleteConnector.mutate(connector.id, {
			onSuccess: () => notify.success("Connector deleted"),
			onError: (error) => notify.error("Could not delete the connector", error),
		});

	const columns: DataTableColumn<Connector>[] = [
		...baseColumns,
		{
			id: "actions",
			header: "",
			enableSorting: false,
			meta: { cellClassName: "w-20" },
			cell: ({ row }) => (
				<DataTableActionsCell>
					{row.original.type === "knowledge" ? (
						<DataTableActionButton
							label={`Manage documents in ${row.original.name}`}
							icon={<FileTextIcon className="size-4" />}
							asChild
						>
							<Link
								to="/connectors/$connectorId"
								params={{ connectorId: row.original.id }}
							/>
						</DataTableActionButton>
					) : null}
					<DataTableActionButton
						label="Delete connector"
						icon={<Trash2Icon className="size-4" />}
						destructive
						pending={isDeleting(row.original)}
						onClick={() => remove(row.original)}
					/>
				</DataTableActionsCell>
			),
		},
	];

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
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
					{TYPE_CARDS.map(({ type, icon: Icon, description }) => {
						const count = connectors.filter(
							(connector) => connector.type === type,
						).length;
						const active = filter === type;
						return (
							<li key={type} className="h-full">
								<button
									type="button"
									aria-pressed={active}
									aria-label={`${connectorLabel(type)} connectors (${count})`}
									onClick={() => setFilter(active ? null : type)}
									className={cn(
										"flex h-full w-full cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 text-left outline-none transition-[border-color,box-shadow] duration-150",
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
				{filter === "knowledge" && shown.length === 0 ? (
					<EmptyState
						icon={<BookOpenIcon />}
						title="No knowledge connectors yet"
						description="A knowledge connector holds documents you upload. Agents it is attached to can search and read them."
						action={
							<Button asChild>
								<Link
									to="/connectors/new"
									search={{ type: "knowledge" }}
									className={buttonLinkClass}
								>
									New knowledge connector
								</Link>
							</Button>
						}
					/>
				) : (
					<DataTable
						columns={columns}
						data={shown}
						caption="Your connectors"
						density="compact"
						emptyMessage={
							filterLabel ? `No ${filterLabel} connectors yet.` : undefined
						}
					/>
				)}
			</ListSection>
		</div>
	);
}
