import { Link, useNavigate } from "@tanstack/react-router";
import {
	CalendarClockIcon,
	ChevronRightIcon,
	GitBranchIcon,
	Loader2Icon,
	PlayIcon,
	Trash2Icon,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
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
import { Button } from "#/components/ui/button";
import {
	useAgents,
	useChains,
	useDeleteChain,
	useStartChainRun,
} from "#/lib/api/queries";
import type { Chain } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { isScheduled, newestFirst } from "#/lib/list-sections";
import { buttonLinkClass, tableLinkClass } from "#/lib/styles";

const CARD_LIMIT = 3;

export function ChainList() {
	const navigate = useNavigate();
	const chains = useChains();
	const agents = useAgents();
	const deleteChain = useDeleteChain();
	const startRun = useStartChainRun();

	if (chains.isPending) {
		return <LoadingState label="Loading chains…" />;
	}
	if (chains.isError) {
		return (
			<ErrorState
				title="Could not load chains"
				error={chains.error}
				onRetry={() => void chains.refetch()}
			/>
		);
	}
	if (chains.data.items.length === 0) {
		return (
			<EmptyState
				icon={<GitBranchIcon />}
				title="No chains yet"
				description="Build an ordered pipeline of agents. The last step's output is the result."
				action={
					<Button asChild>
						<Link to="/chains/new" className={buttonLinkClass}>
							New chain
						</Link>
					</Button>
				}
			/>
		);
	}

	const items = chains.data.items;
	const agentTitle = (id: string) =>
		agents.data?.items.find((agent) => agent.id === id)?.title ?? "Agent";

	const remove = (chain: Chain) =>
		deleteChain.mutate(chain.id, {
			onSuccess: () =>
				notify.success("Chain deleted", { description: chain.title }),
			onError: (error) => notify.error("Could not delete the chain", error),
		});
	const isDeleting = (chain: Chain) =>
		deleteChain.isPending && deleteChain.variables === chain.id;

	const run = (chain: Chain) =>
		startRun.mutate(
			{ chainId: chain.id },
			{
				onSuccess: (chainRun) =>
					notify.success("Chain run started", {
						description: chain.title,
						action: {
							label: "View run",
							onClick: () =>
								void navigate({
									to: "/chain-runs/$chainRunId",
									params: { chainRunId: chainRun.id },
								}),
						},
					}),
				onError: (error) => notify.error("Could not start the chain", error),
			},
		);
	const isStarting = (chain: Chain) =>
		startRun.isPending && startRun.variables?.chainId === chain.id;

	const columns: DataTableColumn<Chain>[] = [
		{
			id: "title",
			accessorFn: (row) => row.title,
			header: "Name",
			cell: ({ row }) => (
				<Link
					to="/chains/$chainId"
					params={{ chainId: row.original.id }}
					className={tableLinkClass}
				>
					{row.original.title}
				</Link>
			),
		},
		{
			id: "steps",
			accessorFn: (row) => row.steps.length,
			header: "Steps",
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground tabular-nums">
					{row.original.steps.length}
				</span>
			),
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
		{
			id: "actions",
			header: () => <span className="sr-only">Actions</span>,
			enableSorting: false,
			meta: {
				headerClassName: "w-[64px] text-right",
				cellClassName: "text-right",
			},
			cell: ({ row }) => (
				<DataTableActionsCell>
					<DataTableActionButton
						label="Delete chain"
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
				title="Recently updated"
				description="Run a chain straight from its card."
			>
				<CardGrid>
					{newestFirst(items, (chain) => chain.updated_at, CARD_LIMIT).map(
						(chain) => (
							<CardGridItem key={chain.id}>
								<ChainCard
									chain={chain}
									agentTitle={agentTitle}
									starting={isStarting(chain)}
									deleting={isDeleting(chain)}
									onRun={() => run(chain)}
									onDelete={() => remove(chain)}
								/>
							</CardGridItem>
						),
					)}
				</CardGrid>
			</ListSection>
			<ListSection title="All chains" count={items.length}>
				<DataTable
					columns={columns}
					data={items}
					caption="Your chains"
					density="compact"
					onRowClick={(chain) =>
						void navigate({
							to: "/chains/$chainId",
							params: { chainId: chain.id },
						})
					}
				/>
			</ListSection>
		</div>
	);
}

function ChainCard({
	chain,
	agentTitle,
	starting,
	deleting,
	onRun,
	onDelete,
}: {
	chain: Chain;
	agentTitle: (agentId: string) => string;
	starting: boolean;
	deleting: boolean;
	onRun: () => void;
	onDelete: () => void;
}) {
	const steps = [...chain.steps].sort((a, b) => a.position - b.position);
	return (
		<ResourceCard>
			<ResourceCardHeader>
				<ResourceCardIcon>
					<GitBranchIcon />
				</ResourceCardIcon>
				<ResourceCardTitle>
					<Link
						to="/chains/$chainId"
						params={{ chainId: chain.id }}
						{...cardLinkProps}
					>
						{chain.title}
					</Link>
				</ResourceCardTitle>
				<ResourceCardActions>
					<DataTableActionButton
						label={`Delete ${chain.title}`}
						icon={<Trash2Icon className="size-4" />}
						destructive
						pending={deleting}
						onClick={onDelete}
					/>
				</ResourceCardActions>
			</ResourceCardHeader>
			<ResourceCardBody>
				<ol
					aria-label="Steps"
					className="flex flex-wrap items-center gap-1 text-xs"
				>
					{steps.map((step, index) => (
						<li
							key={`${step.position}-${step.agent_id}`}
							className="flex min-w-0 items-center gap-1"
						>
							<span className="max-w-40 truncate rounded-md border bg-muted/40 px-1.5 py-0.5">
								{step.label || agentTitle(step.agent_id)}
							</span>
							{index < steps.length - 1 ? (
								<ChevronRightIcon
									className="size-3 text-muted-foreground"
									aria-hidden="true"
								/>
							) : null}
						</li>
					))}
				</ol>
			</ResourceCardBody>
			<ResourceCardFooter>
				<div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					{isScheduled(chain.schedule) ? (
						<>
							<CalendarClockIcon className="size-3.5" aria-hidden="true" />
							<span>Scheduled</span>
						</>
					) : (
						<span>On demand</span>
					)}
					<span aria-hidden="true">·</span>
					<span className="truncate">
						Updated <RelativeTime iso={chain.updated_at} />
					</span>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={starting}
					aria-label={`Run ${chain.title}`}
					onClick={onRun}
				>
					{starting ? (
						<Loader2Icon className="animate-spin" aria-hidden="true" />
					) : (
						<PlayIcon aria-hidden="true" />
					)}
					Run
				</Button>
			</ResourceCardFooter>
		</ResourceCard>
	);
}
