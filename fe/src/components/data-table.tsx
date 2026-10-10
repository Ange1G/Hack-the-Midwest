import {
	type CellData,
	type ColumnDef,
	createSortedRowModel,
	flexRender,
	metaHelper,
	type RowData,
	rowSortingFeature,
	type SortingState,
	sortFn_alphanumeric,
	sortFn_basic,
	sortFn_datetime,
	sortFn_text,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { TooltipProvider } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

type DataTableColumnMeta = {
	headerClassName?: string;
	cellClassName?: string;
};

// Defined once, statically: the TanStack Table features every app table uses.
const features = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	columnMeta: metaHelper<DataTableColumnMeta>(),
	sortFns: {
		alphanumeric: sortFn_alphanumeric,
		basic: sortFn_basic,
		datetime: sortFn_datetime,
		text: sortFn_text,
	},
});

export type DataTableColumn<
	TData extends RowData,
	TValue extends CellData = CellData,
> = ColumnDef<typeof features, TData, TValue>;

type Props<TData extends RowData> = {
	columns: DataTableColumn<TData>[];
	data: TData[];
	caption: string;
	initialSorting?: SortingState;
	emptyMessage?: string;
};

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
	const className = "size-3.5 text-muted-foreground";
	if (direction === "asc")
		return <ArrowUp className={className} aria-hidden="true" />;
	if (direction === "desc") {
		return <ArrowDown className={className} aria-hidden="true" />;
	}
	return (
		<ArrowUpDown className={`${className} opacity-60`} aria-hidden="true" />
	);
}

function ariaSort(
	direction: false | "asc" | "desc",
): "ascending" | "descending" | undefined {
	if (direction === "asc") return "ascending";
	if (direction === "desc") return "descending";
	return undefined;
}

export function DataTable<TData extends RowData>({
	columns,
	data,
	caption,
	initialSorting = [],
	emptyMessage = "Nothing to show.",
}: Props<TData>) {
	const table = useTable({
		features,
		columns,
		data,
		initialState: { sorting: initialSorting },
	});
	const rows = table.getRowModel().rows;

	return (
		<div className="table-panel overflow-hidden rounded-xl">
			<TooltipProvider delayDuration={0}>
				<Table>
					<caption className="sr-only">{caption}</caption>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="border-b hover:bg-transparent"
							>
								{headerGroup.headers.map((header) => {
									const column = header.column;
									const direction = column.getIsSorted();
									const label =
										typeof column.columnDef.header === "string"
											? column.columnDef.header
											: column.id;
									const content = header.isPlaceholder
										? null
										: flexRender(column.columnDef.header, header.getContext());
									return (
										<TableHead
											key={header.id}
											aria-sort={ariaSort(direction)}
											className={cn(
												"h-12 px-4 font-medium",
												column.columnDef.meta?.headerClassName,
											)}
										>
											{column.getCanSort() ? (
												<button
													type="button"
													aria-label={`Sort by ${label}`}
													className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground hover:text-(--sea-ink-soft) focus-visible:outline-2 focus-visible:outline-ring"
													onClick={column.getToggleSortingHandler()}
												>
													{content}
													<SortIcon direction={direction} />
												</button>
											) : (
												content
											)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-16 px-4 text-center text-sm text-muted-foreground"
								>
									{emptyMessage}
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow key={row.id} className="hover:bg-(--chip-bg)">
									{row.getAllCells().map((cell) => (
										<TableCell
											key={cell.id}
											className={cn(
												"h-16 px-4",
												cell.column.columnDef.meta?.cellClassName,
											)}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</TooltipProvider>
		</div>
	);
}
