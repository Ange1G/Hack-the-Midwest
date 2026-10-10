import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createUser } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { SignupForm } from "./signup-form";

describe("SignupForm", () => {
	it("creates an account and reports the user", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		renderWithProviders(<SignupForm onSuccess={onSuccess} />);

		await user.type(await screen.findByLabelText(/email/i), "new@example.com");
		await user.type(
			screen.getByLabelText(/password/i),
			"correct horse battery",
		);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() =>
			expect(onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({ email: "new@example.com" }),
			),
		);
	});

	it("shows the server error when the email is already taken", async () => {
		createUser("taken@example.com", "correct horse battery");
		const user = userEvent.setup();
		renderWithProviders(<SignupForm onSuccess={vi.fn()} />);

		await user.type(
			await screen.findByLabelText(/email/i),
			"taken@example.com",
		);
		await user.type(screen.getByLabelText(/password/i), "another password");
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			/already exists/i,
		);
	});
});
