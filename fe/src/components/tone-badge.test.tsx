import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";
import { ToneBadge } from "./tone-badge";

describe("ToneBadge", () => {
	it("renders label text in the foreground colour with a tone dot", () => {
		const { container } = render(<ToneBadge tone="danger">Flagged</ToneBadge>);

		expect(screen.getByText("Flagged")).toBeInTheDocument();
		expect(container.firstElementChild).toHaveClass("text-foreground");
		expect(container.querySelector("[aria-hidden='true']")).toHaveClass(
			"bg-destructive",
		);
	});

	it("pulses the dot only when asked", () => {
		const { container, rerender } = render(
			<ToneBadge tone="info">Running</ToneBadge>,
		);
		const dot = () => container.querySelector("[aria-hidden='true']");
		expect(dot()).not.toHaveClass("motion-safe:animate-status-pulse");
		rerender(
			<ToneBadge tone="info" pulse>
				Running
			</ToneBadge>,
		);
		expect(dot()).toHaveClass("motion-safe:animate-status-pulse");
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

	it("maps chain step statuses", () => {
		const { rerender } = render(<StatusBadge status="pending" />);
		expect(screen.getByText("Pending")).toBeInTheDocument();
		rerender(<StatusBadge status="skipped" />);
		expect(screen.getByText("Skipped")).toBeInTheDocument();
	});
});
