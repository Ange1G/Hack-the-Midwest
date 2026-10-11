import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./states";

const bars = (element: HTMLElement) =>
	element.querySelectorAll('[data-slot="skeleton"]').length;

describe("LoadingState", () => {
	it("announces what is loading with a label screen readers hear", () => {
		render(<LoadingState label="Loading agents…" />);

		const status = screen.getByRole("status");
		expect(status).toHaveTextContent("Loading agents…");
		expect(screen.getByText("Loading agents…")).toHaveClass("sr-only");
		expect(status).toHaveAttribute("data-layout", "panel");
		expect(bars(status)).toBeGreaterThanOrEqual(3);
	});

	it("sketches a table with a header and several rows", () => {
		render(<LoadingState label="Loading agents…" layout="table" />);

		const status = screen.getByRole("status");
		expect(status).toHaveAttribute("data-layout", "table");
		expect(
			status.querySelectorAll("[data-skeleton-row]").length,
		).toBeGreaterThanOrEqual(4);
	});

	it("sketches a detail page, a run page, and a form", () => {
		for (const layout of ["detail", "run", "form"] as const) {
			const { unmount } = render(
				<LoadingState label={`Loading ${layout}…`} layout={layout} />,
			);

			const status = screen.getByRole("status");
			expect(status).toHaveAttribute("data-layout", layout);
			expect(bars(status)).toBeGreaterThanOrEqual(6);
			unmount();
		}
	});
});
