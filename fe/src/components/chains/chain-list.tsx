import { Link } from "@tanstack/react-router";
import { FileTextIcon, Trash2Icon } from "lucide-react";
import { DataTable, type DataTableColumn } from "#/components/data-table";
import {
	DataTableActionButton,
	DataTableActionsCell,
} from "#/components/data-table-action-button";
import { EmptyState, ErrorState, LoadingState } from "#/components/states";
import { Button } from "#/components/ui/button";
import { useChains, useDeleteChain } from "#/lib/api/queries";
import type { Chain } from "#/lib/api/schemas";
import { formatDateTime } from "#/lib/format";
import { buttonLinkClass, tableLinkClass } from "#/lib/styles";

export function ChainList() {
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
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			meta: {
				headerClassName: "w-[120px] text-right",
				cellClassName: "text-right",
			},
			cell: ({ row }) => (
				<DataTableActionsCell>
					<DataTableActionButton
						label="View chain"
						icon={<FileTextIcon className="size-4" />}
						asChild
					>
						<Link to="/chains/$chainId" params={{ chainId: row.original.id }} />
					</DataTableActionButton>
					<DataTableActionButton
						label="Delete chain"
						icon={<Trash2Icon className="size-4" />}
						destructive
						pending={
							deleteChain.isPending && deleteChain.variables === row.original.id
						}
						onClick={() => deleteChain.mutate(row.original.id)}
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
		/>
	);
}
