import type { z } from "zod";
import { apiErrorBodySchema } from "./schemas";

export const API_BASE_URL: string =
	import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly fields: Record<string, string> | undefined;

	constructor(
		status: number,
		code: string,
		message: string,
		fields?: Record<string, string>,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.fields = fields;
	}
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function send(
	path: string,
	method: Method,
	body?: unknown,
): Promise<Response> {
	const headers: Record<string, string> = { Accept: "application/json" };
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}

	let response: Response;
	try {
		response = await fetch(`${API_BASE_URL}${path}`, {
			method,
			credentials: "include",
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch (cause) {
		throw new ApiError(
			0,
			"network_error",
			"Could not reach the server.",
			undefined,
			{ cause },
		);
	}

	if (!response.ok) {
		throw await toApiError(response);
	}
	return response;
}

async function toApiError(response: Response): Promise<ApiError> {
	const text = await response.text();
	try {
		const parsed = apiErrorBodySchema.parse(JSON.parse(text));
		return new ApiError(
			response.status,
			parsed.error.code,
			parsed.error.message,
			parsed.error.fields,
		);
	} catch {
		const message =
			text.trim() ||
			response.statusText ||
			`Request failed with status ${response.status}`;
		return new ApiError(response.status, "http_error", message);
	}
}

async function parseBody<T>(
	response: Response,
	schema: z.ZodType<T>,
): Promise<T> {
	const data: unknown = await response.json();
	return schema.parse(data);
}

export const api = {
	get: <T>(path: string, schema: z.ZodType<T>): Promise<T> =>
		send(path, "GET").then((response) => parseBody(response, schema)),
	post: <T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> =>
		send(path, "POST", body).then((response) => parseBody(response, schema)),
	postVoid: (path: string, body?: unknown): Promise<void> =>
		send(path, "POST", body).then(() => undefined),
	delete: (path: string): Promise<void> =>
		send(path, "DELETE").then(() => undefined),
};
