import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createUser } from "#/mocks/state";
import { renderWithProviders } from "#/test/render";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
	it("validates before calling the API", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		renderWithProviders(<LoginForm onSuccess={onSuccess} />);

		await user.click(await screen.findByRole("button", { name: /sign in/i }));

		expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
		expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it("signs in with valid credentials and reports the user", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		renderWithProviders(<LoginForm onSuccess={onSuccess} />);

		await user.type(
			await screen.findByLabelText(/email/i),
			"angel@example.com",
		);
		await user.type(
			screen.getByLabelText(/password/i),
			"correct horse battery",
		);
		await user.click(screen.getByRole("button", { name: /sign in/i }));

		await waitFor(() =>
			expect(onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({ email: "angel@example.com" }),
			),
		);
	});

	it("shows the server's message when credentials are rejected", async () => {
		createUser("angel@example.com", "correct horse battery");
		const user = userEvent.setup();
		renderWithProviders(<LoginForm onSuccess={vi.fn()} />);

		await user.type(
			await screen.findByLabelText(/email/i),
			"angel@example.com",
		);
		await user.type(screen.getByLabelText(/password/i), "wrong password");
		await user.click(screen.getByRole("button", { name: /sign in/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			/email or password is incorrect/i,
		);
	});
});
