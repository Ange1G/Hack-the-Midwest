import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";
import { ToneBadge } from "./tone-badge";

describe("ToneBadge", () => {
	it("renders label text with a status dot instead of a pill border", () => {
		const { container } = render(<ToneBadge tone="danger">Flagged</ToneBadge>);

		expect(screen.getByText("Flagged")).toBeInTheDocument();
		expect(container.querySelector(".rounded-full.border")).toBeNull();
		expect(container.querySelector("[aria-hidden='true']")).toHaveClass(
			"bg-(--destructive)",
		);
	});
});

describe("StatusBadge", () => {
	it("maps run statuses to readable labels", () => {
		render(<StatusBadge status="timed_out" />);
		expect(screen.getByText("Timed out")).toBeInTheDocument();
	});

	it("shows succeeded for a completed run", () => {
		render(<StatusBadge status="succeeded" />);
		expect(screen.getByText("Succeeded")).toBeInTheDocument();
	});
});
