import {
	type CellData,
	type ColumnDef,
	createSortedRowModel,
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
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { TooltipProvider } from "#/components/ui/tooltip";
import { easeOut } from "#/lib/motion";
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
	density?: "comfortable" | "compact";
	// Pointer shortcut for the row's primary destination. Every clickable row
	// must also render an explicit link or button for keyboard users.
	onRowClick?: (row: TData) => void;
	isRowSelected?: (row: TData) => boolean;
	className?: string;
};

const MAX_STAGGERED_ROWS = 12;

// Clicks on controls inside a row keep their own behaviour.
function fromInteractiveChild(event: MouseEvent<HTMLElement>): boolean {
	const target = event.target as HTMLElement;
	const interactive = target.closest(
		"a,button,input,select,textarea,label,[role=menuitem],[role=option]",
	);
	return interactive !== null && interactive !== event.currentTarget;
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
	const className = "size-3";
	if (direction === "asc")
		return <ArrowUp className={className} aria-hidden="true" />;
	if (direction === "desc") {
		return <ArrowDown className={className} aria-hidden="true" />;
	}
	return (
		<ChevronsUpDown
			className={`${className} opacity-0 transition-opacity group-hover/sort:opacity-60`}
			aria-hidden="true"
		/>
	);
}

function ariaSort(
	direction: false | "asc" | "desc",
): "ascending" | "descending" | undefined {
	if (direction === "asc") return "ascending";
	if (direction === "desc") return "descending";
	return undefined;
}

const MotionTableRow = motion.create(TableRow);

// flexRender mounts a function renderer as a component, so a column array
// rebuilt on each render (closures over query data) would give every cell a
// new component type and remount its controls mid-interaction. Calling the
// renderer keeps the cell's element tree stable across renders.
function renderSlot<TProps extends object>(
	slot: ReactNode | ((props: TProps) => ReactNode) | undefined,
	props: TProps,
): ReactNode {
	return typeof slot === "function" ? slot(props) : slot;
}

export function DataTable<TData extends RowData>({
	columns,
	data,
	caption,
	initialSorting = [],
	emptyMessage = "Nothing to show.",
	density = "comfortable",
	onRowClick,
	isRowSelected,
	className,
}: Props<TData>) {
	const table = useTable({
		features,
		columns,
		data,
		initialState: { sorting: initialSorting },
	});
	const rows = table.getRowModel().rows;
	const reduceMotion = useReducedMotion();
	const cellHeight = density === "compact" ? "h-11" : "h-14";

	return (
		<div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
			<TooltipProvider delayDuration={300}>
				<Table>
					<caption className="sr-only">{caption}</caption>
					<TableHeader className="bg-muted/40">
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
										: renderSlot(column.columnDef.header, header.getContext());
									return (
										<TableHead
											key={header.id}
											aria-sort={ariaSort(direction)}
											className={cn(
												"h-10 px-4 text-xs font-medium text-muted-foreground",
												column.columnDef.meta?.headerClassName,
											)}
										>
											{column.getCanSort() ? (
												<button
													type="button"
													aria-label={`Sort by ${label}`}
													className="group/sort -mx-1 inline-flex cursor-pointer items-center gap-1 rounded-sm px-1 font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
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
							<TableRow className="hover:bg-transparent">
								<TableCell
									colSpan={columns.length}
									className="h-24 px-4 text-center text-sm text-muted-foreground"
								>
									{emptyMessage}
								</TableCell>
							</TableRow>
						) : (
							rows.map((row, index) => {
								const selected = isRowSelected?.(row.original) ?? false;
								return (
									<MotionTableRow
										key={row.id}
										initial={reduceMotion ? false : { opacity: 0, y: 4 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{
											duration: 0.2,
											ease: easeOut,
											delay: Math.min(index, MAX_STAGGERED_ROWS) * 0.025,
										}}
										data-state={selected ? "selected" : undefined}
										aria-current={selected ? "true" : undefined}
										className={cn(
											"group/row hover:bg-muted/40",
											onRowClick && "cursor-pointer",
										)}
										onClick={
											onRowClick
												? (event: MouseEvent<HTMLTableRowElement>) => {
														if (fromInteractiveChild(event)) return;
														onRowClick(row.original);
													}
												: undefined
										}
									>
										{row.getAllCells().map((cell) => (
											<TableCell
												key={cell.id}
												className={cn(
													cellHeight,
													"px-4",
													cell.column.columnDef.meta?.cellClassName,
												)}
											>
												{cell.column.columnDef.cell === undefined
													? String(cell.getValue() ?? "")
													: renderSlot(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
											</TableCell>
										))}
									</MotionTableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</TooltipProvider>
		</div>
	);
}
