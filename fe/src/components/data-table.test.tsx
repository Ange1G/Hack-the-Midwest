import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn } from "./data-table";

type Row = { name: string; count: number };

const columns: DataTableColumn<Row>[] = [
	{ id: "name", accessorFn: (row) => row.name, header: "Name" },
	{
		id: "count",
		accessorFn: (row) => row.count,
		header: "Count",
		cell: ({ row }) => `${row.original.count} items`,
	},
];

const rows: Row[] = [
	{ name: "Bravo", count: 2 },
	{ name: "Alpha", count: 10 },
	{ name: "Charlie", count: 1 },
];

function firstCells(): (string | null | undefined)[] {
	return screen
		.getAllByRole("row")
		.slice(1)
		.map((row) => within(row).getAllByRole("cell")[0]?.textContent);
}

describe("DataTable", () => {
	it("renders headers and one row per record in the given order", () => {
		render(<DataTable columns={columns} data={rows} caption="Things" />);

		const table = screen.getByRole("table", { name: "Things" });
		expect(
			within(table)
				.getAllByRole("columnheader")
				.map((header) => header.textContent),
		).toEqual(["Name", "Count"]);
		expect(firstCells()).toEqual(["Bravo", "Alpha", "Charlie"]);
		expect(within(table).getByText("10 items")).toBeInTheDocument();
	});

	it("sorts by a column when its header is activated and exposes aria-sort", async () => {
		const user = userEvent.setup();
		render(<DataTable columns={columns} data={rows} caption="Things" />);

		await user.click(screen.getByRole("button", { name: /sort by name/i }));
		expect(firstCells()).toEqual(["Alpha", "Bravo", "Charlie"]);
		expect(screen.getByRole("columnheader", { name: /name/i })).toHaveAttribute(
			"aria-sort",
			"ascending",
		);

		await user.click(screen.getByRole("button", { name: /sort by name/i }));
		expect(firstCells()).toEqual(["Charlie", "Bravo", "Alpha"]);
		expect(screen.getByRole("columnheader", { name: /name/i })).toHaveAttribute(
			"aria-sort",
			"descending",
		);
	});

	it("applies the initial sorting", () => {
		render(
			<DataTable
				columns={columns}
				data={rows}
				caption="Things"
				initialSorting={[{ id: "count", desc: true }]}
			/>,
		);

		expect(firstCells()).toEqual(["Alpha", "Bravo", "Charlie"]);
	});

	it("shows the empty message when there are no rows", () => {
		render(
			<DataTable
				columns={columns}
				data={[]}
				caption="Things"
				emptyMessage="Nothing here"
			/>,
		);

		expect(screen.getByText("Nothing here")).toBeInTheDocument();
	});
});
