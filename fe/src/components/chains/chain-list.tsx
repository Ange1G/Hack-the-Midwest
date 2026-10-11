import { Link, useNavigate } from "@tanstack/react-router";
import { GitBranchIcon, Trash2Icon } from "lucide-react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { RelativeTime } from "#/components/relative-time";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { Button } from "#/components/ui/button";
import { useChains, useDeleteChain } from "#/lib/api/queries";
import type { Chain } from "#/lib/api/schemas";
import { notify } from "#/lib/feedback";
import { buttonLinkClass, tableLinkClass } from "#/lib/styles";

export function ChainList() {
	const navigate = useNavigate();
	const chains = useChains();
	const deleteChain = useDeleteChain();

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

	const remove = (chain: Chain) =>
		deleteChain.mutate(chain.id, {
			onSuccess: () =>
				notify.success("Chain deleted", { description: chain.title }),
			onError: (error) => notify.error("Could not delete the chain", error),
		});

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
						pending={
							deleteChain.isPending && deleteChain.variables === row.original.id
						}
						onClick={() => remove(row.original)}
					/>
				</DataTableActionsCell>
			),
		},
	];

	return (
		<DataTable
			columns={columns}
			data={chains.data.items}
			caption="Your chains"
			onRowClick={(chain) =>
				void navigate({ to: "/chains/$chainId", params: { chainId: chain.id } })
			}
		/>
	);
}
