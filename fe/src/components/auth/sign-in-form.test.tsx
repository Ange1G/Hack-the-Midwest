import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "#/lib/api/client";
import { getSessionUser } from "#/lib/api/session";
import { server } from "#/mocks/server";
import { renderWithProviders } from "#/test/render";
import { SignInForm } from "./sign-in-form";

describe("SignInForm", () => {
	it("requires an SSO id before calling the API", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		renderWithProviders(<SignInForm onSuccess={onSuccess} />);

		await user.click(await screen.findByRole("button", { name: /sign in/i }));

		expect(await screen.findByText(/enter your sso id/i)).toBeInTheDocument();
		expect(onSuccess).not.toHaveBeenCalled();
		expect(getSessionUser()).toBeNull();
	});

	it("signs in, stores the identity, and reports it", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		renderWithProviders(<SignInForm onSuccess={onSuccess} />);

		await user.type(await screen.findByLabelText(/sso id/i), "angel");
		await user.click(screen.getByRole("button", { name: /sign in/i }));

		await waitFor(() =>
			expect(onSuccess).toHaveBeenCalledWith({ user_sso: "angel" }),
		);
		expect(getSessionUser()).toEqual({ user_sso: "angel" });
	});

	it("shows the API's message when sign-in is rejected", async () => {
		server.use(
			http.get(`${API_BASE_URL}/agents/:sso`, () =>
				HttpResponse.json(
					{
						data: null,
						error: {
							code: "unauthorized",
							message: "Production authentication is not configured",
							details: null,
						},
						metadata: { request_id: "req_1" },
						pagination: null,
					},
					{ status: 401 },
				),
			),
		);
		const user = userEvent.setup();
		renderWithProviders(<SignInForm onSuccess={vi.fn()} />);

		await user.type(await screen.findByLabelText(/sso id/i), "angel");
		await user.click(screen.getByRole("button", { name: /sign in/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			/production authentication is not configured/i,
		);
		expect(getSessionUser()).toBeNull();
	});
});
