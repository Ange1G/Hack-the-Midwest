import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HttpCallChip } from "./http-call-chip";

describe("HttpCallChip", () => {
	it("renders a segmented contract tag with method and name", () => {
		render(<HttpCallChip method="GET" name="status" />);

		expect(screen.getByText("status")).toBeInTheDocument();
		expect(screen.getByText("GET call status")).toHaveClass("sr-only");
		expect(screen.getByTitle("GET status")).toBeInTheDocument();
	});

	it("distinguishes POST in the method segment", () => {
		const { container } = render(<HttpCallChip method="POST" name="leak" />);

		const methodSegment = container.querySelector("[aria-hidden='true']");
		expect(methodSegment).toHaveTextContent("POST");
		expect(methodSegment).toHaveClass("bg-info/15", "text-foreground");
	});
});
