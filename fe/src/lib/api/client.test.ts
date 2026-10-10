import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { server } from "#/mocks/server";
import { API_BASE_URL, ApiError, api, DEV_USER_HEADER } from "./client";
import { setSessionUser } from "./session";

const pingSchema = z.object({ ok: z.boolean() });
const ping = `${API_BASE_URL}/ping`;

function ok(data: unknown, pagination: unknown = null) {
	return HttpResponse.json({
		data,
		error: null,
		metadata: { request_id: "req_1" },
		pagination,
	});
}

function fail(
	status: number,
	code: string,
	message: string,
	details: unknown = null,
) {
	return HttpResponse.json(
		{
			data: null,
			error: { code, message, details },
			metadata: { request_id: "req_1" },
			pagination: null,
		},
		{ status },
	);
}

describe("api.get", () => {
	it("unwraps the envelope and parses data with the given schema", async () => {
		server.use(http.get(ping, () => ok({ ok: true })));
		await expect(api.get("/ping", pingSchema)).resolves.toEqual({ ok: true });
	});

	it("sends the development identity header when a session exists", async () => {
		setSessionUser("angel");
		let header: string | null = "unset";
		server.use(
			http.get(ping, ({ request }) => {
				header = request.headers.get(DEV_USER_HEADER);
				return ok({ ok: true });
			}),
		);
		await api.get("/ping", pingSchema);
		expect(header).toBe("angel");
	});

	it("sends no identity header without a session", async () => {
		let header: string | null = "unset";
		server.use(
			http.get(ping, ({ request }) => {
				header = request.headers.get(DEV_USER_HEADER);
				return ok({ ok: true });
			}),
		);
		await api.get("/ping", pingSchema);
		expect(header).toBeNull();
	});

	it("maps an error envelope to ApiError", async () => {
		server.use(
			http.get(ping, () =>
				fail(403, "forbidden", "You may not access agents for another user"),
			),
		);
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			status: 403,
			code: "forbidden",
			message: "You may not access agents for another user",
		});
	});

	it("maps validation details to field messages", async () => {
		server.use(
			http.get(ping, () =>
				fail(422, "validation_error", "Request validation failed", {
					errors: [
						{ loc: ["body", "title"], msg: "Field required", type: "missing" },
						{ loc: ["query", "page"], msg: "Must be >= 1", type: "ge" },
					],
				}),
			),
		);
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toMatchObject({
			code: "validation_error",
			fields: { title: "Field required", page: "Must be >= 1" },
		});
	});

	it("falls back to a generic code when the error body is not an envelope", async () => {
		server.use(
			http.get(ping, () => new HttpResponse("Bad gateway", { status: 502 })),
		);
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 502, code: "http_error" });
	});

	it("treats a success envelope with null data as an error", async () => {
		server.use(http.get(ping, () => ok(null)));
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ code: "empty_response" });
	});

	it("rejects data that does not match the schema", async () => {
		server.use(http.get(ping, () => ok({ ok: "yes" })));
		await expect(api.get("/ping", pingSchema)).rejects.toThrow();
	});

	it("maps a network failure to ApiError with code network_error", async () => {
		server.use(http.get(ping, () => HttpResponse.error()));
		const error = await api.get("/ping", pingSchema).catch((e: unknown) => e);
		expect(error).toMatchObject({ status: 0, code: "network_error" });
	});
});

describe("api.list", () => {
	it("returns the items and the pagination block", async () => {
		server.use(
			http.get(`${API_BASE_URL}/things`, () =>
				ok([{ ok: true }, { ok: false }], {
					page: 1,
					page_size: 2,
					total_items: 3,
					total_pages: 2,
				}),
			),
		);
		const result = await api.list("/things", pingSchema);
		expect(result.items).toEqual([{ ok: true }, { ok: false }]);
		expect(result.pagination).toEqual({
			page: 1,
			page_size: 2,
			total_items: 3,
			total_pages: 2,
		});
	});
});

describe("api.post", () => {
	it("sends a JSON body and unwraps the response", async () => {
		let received: unknown;
		server.use(
			http.post(`${API_BASE_URL}/things`, async ({ request }) => {
				received = await request.json();
				return HttpResponse.json(
					{
						data: { ok: true },
						error: null,
						metadata: { request_id: "req_1" },
						pagination: null,
					},
					{ status: 201 },
				);
			}),
		);
		await expect(
			api.post("/things", pingSchema, { name: "x" }),
		).resolves.toEqual({ ok: true });
		expect(received).toEqual({ name: "x" });
	});
});

describe("api.postVoid", () => {
	it("accepts a 204 and an envelope without data", async () => {
		server.use(
			http.post(
				`${API_BASE_URL}/a`,
				() => new HttpResponse(null, { status: 204 }),
			),
			http.post(`${API_BASE_URL}/b`, () => ok(null)),
		);
		await expect(api.postVoid("/a")).resolves.toBeUndefined();
		await expect(api.postVoid("/b")).resolves.toBeUndefined();
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
