import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError } from "#/lib/api/client";
import { ApiUnavailable } from "./api-unavailable";

describe("ApiUnavailable", () => {
	it("explains how to point at an API when the server is unreachable", async () => {
		const user = userEvent.setup();
		const onRetry = vi.fn();
		render(
			<ApiUnavailable
				error={new ApiError(0, "network_error", "Could not reach the server.")}
				onRetry={onRetry}
			/>,
		);

		const alert = screen.getByRole("alert");
		expect(alert).toHaveTextContent(/could not reach the api/i);
		expect(alert).toHaveTextContent(API_BASE_URL);
		expect(alert).toHaveTextContent(/npm run dev:mock/);

		await user.click(screen.getByRole("button", { name: /try again/i }));
		expect(onRetry).toHaveBeenCalled();
	});

	it("shows any other error verbatim", () => {
		render(<ApiUnavailable error={new Error("Boom")} onRetry={vi.fn()} />);

		const alert = screen.getByRole("alert");
		expect(alert).toHaveTextContent(/could not load the app/i);
		expect(alert).toHaveTextContent("Boom");
		expect(alert).not.toHaveTextContent(/dev:mock/);
	});
});
