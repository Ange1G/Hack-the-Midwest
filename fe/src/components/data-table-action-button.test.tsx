import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "#/components/ui/tooltip";
import { DataTableActionButton } from "./data-table-action-button";

describe("DataTableActionButton", () => {
	it("exposes the action name and calls onClick", async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		render(
			<TooltipProvider>
				<DataTableActionButton
					label="Start"
					icon={<PlayIcon />}
					onClick={onClick}
				/>
			</TooltipProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Start" }));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("is disabled and busy while pending", () => {
		render(
			<TooltipProvider>
				<DataTableActionButton
					label="Start"
					icon={<PlayIcon />}
					pending
					onClick={vi.fn()}
				/>
			</TooltipProvider>,
		);

		expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
	});
});
