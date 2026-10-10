import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { server } from "#/mocks/server";
import { API_BASE_URL, ApiError, api } from "./client";

const pingSchema = z.object({ ok: z.boolean() });
const ping = `${API_BASE_URL}/ping`;

describe("api.get", () => {
	it("parses a JSON response with the given schema", async () => {
		server.use(http.get(ping, () => HttpResponse.json({ ok: true })));
		await expect(api.get("/ping", pingSchema)).resolves.toEqual({ ok: true });
	});

	it("sends credentials so the auth cookie travels with the request", async () => {
		server.use(http.get(ping, () => HttpResponse.json({ ok: true })));
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		try {
			await api.get("/ping", pingSchema);
			const init = fetchSpy.mock.calls[0]?.[1];
			expect(init?.credentials).toBe("include");
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it("throws ApiError carrying the server error envelope on a 4xx", async () => {
		server.use(
			http.get(ping, () =>
				HttpResponse.json(
					{ error: { code: "not_found", message: "No such thing" } },
					{ status: 404 },
				),
			),
		);
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			status: 404,
			code: "not_found",
			message: "No such thing",
		});
	});

	it("throws ApiError with a generic code when the error body is not the envelope", async () => {
		server.use(
			http.get(ping, () => new HttpResponse("Bad gateway", { status: 502 })),
		);
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 502, code: "http_error" });
	});

	it("rejects a 2xx body that does not match the schema", async () => {
		server.use(http.get(ping, () => HttpResponse.json({ ok: "yes" })));
		await expect(api.get("/ping", pingSchema)).rejects.toThrow();
	});

	it("maps a network failure to ApiError with code network_error", async () => {
		server.use(http.get(ping, () => HttpResponse.error()));
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 0, code: "network_error" });
	});
});

describe("api.post", () => {
	it("sends a JSON body and parses the response", async () => {
		let received: unknown;
		server.use(
			http.post(`${API_BASE_URL}/things`, async ({ request }) => {
				received = await request.json();
				return HttpResponse.json({ ok: true }, { status: 201 });
			}),
		);
		await expect(
			api.post("/things", pingSchema, { name: "x" }),
		).resolves.toEqual({ ok: true });
		expect(received).toEqual({ name: "x" });
	});
});

describe("api.postVoid", () => {
	it("resolves with no value on 204", async () => {
		server.use(
			http.post(
				`${API_BASE_URL}/logout`,
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		await expect(api.postVoid("/logout")).resolves.toBeUndefined();
	});
});

describe("api.delete", () => {
	it("resolves with no value on 204", async () => {
		server.use(
			http.delete(
				`${API_BASE_URL}/things/1`,
				() => new HttpResponse(null, { status: 204 }),
			),
		);
		await expect(api.delete("/things/1")).resolves.toBeUndefined();
	});
});
