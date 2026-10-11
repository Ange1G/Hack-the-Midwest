import { z } from "zod";
import { getCurrentUser } from "./identity";
import { envelope, type Pagination } from "./schemas";

export const API_BASE_URL: string =
	import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

// Development identity header the backend trusts (api/src/app/api/deps.py).
export const DEV_USER_HEADER = "X-Dev-User-SSO";

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
	body: unknown,
): Promise<Response> {
	const headers: Record<string, string> = {
		Accept: "application/json",
		[DEV_USER_HEADER]: getCurrentUser().user_sso,
	};
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

const anyEnvelope = envelope(z.unknown());

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// Two error detail shapes come back from the backend. Request validation
// (pydantic) issues look like { loc: ["body", "title"], msg }; the location
// prefix (body, query, path) is dropped. Configuration errors from the agent
// service look like { field: "configurations.primitives.m.URL", message }.
function fieldsFromDetails(
	details: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
	const errors = details?.errors;
	if (!Array.isArray(errors)) return undefined;
	const fields: Record<string, string> = {};
	for (const issue of errors) {
		if (!issue || typeof issue !== "object") continue;
		const { loc, msg, field, message } = issue as {
			loc?: unknown;
			msg?: unknown;
			field?: unknown;
			message?: unknown;
		};
		if (typeof field === "string" && typeof message === "string") {
			if (!(field in fields)) fields[field] = message;
			continue;
		}
		if (!Array.isArray(loc) || typeof msg !== "string") continue;
		const key = loc
			.filter((part) => part !== "body" && part !== "query" && part !== "path")
			.map(String)
			.join(".");
		if (key && !(key in fields)) fields[key] = msg;
	}
	return Object.keys(fields).length > 0 ? fields : undefined;
}

async function toApiError(response: Response): Promise<ApiError> {
	const text = await response.text();
	const parsed = anyEnvelope.safeParse(parseJson(text));
	if (parsed.success && parsed.data.error) {
		const { code, message, details } = parsed.data.error;
		return new ApiError(
			response.status,
			code,
			message,
			fieldsFromDetails(details),
		);
	}
	const message =
		text.trim() ||
		response.statusText ||
		`Request failed with status ${response.status}`;
	return new ApiError(response.status, "http_error", message);
}

async function request<T>(
	path: string,
	method: Method,
	schema: z.ZodType<T>,
	body?: unknown,
): Promise<{ data: T; pagination: Pagination | null }> {
	const response = await send(path, method, body);
	const parsed = envelope(schema).parse(await response.json());
	if (parsed.data === null) {
		throw new ApiError(
			response.status,
			"empty_response",
			`The API returned no data for ${path}.`,
		);
	}
	return { data: parsed.data, pagination: parsed.pagination ?? null };
}

export const api = {
	get: <T>(path: string, schema: z.ZodType<T>) =>
		request(path, "GET", schema).then((result) => result.data),
	list: <T>(path: string, item: z.ZodType<T>) =>
		request(path, "GET", z.array(item)).then((result) => ({
			items: result.data,
			pagination: result.pagination,
		})),
	post: <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
		request(path, "POST", schema, body).then((result) => result.data),
	postVoid: async (path: string, body?: unknown): Promise<void> => {
		await send(path, "POST", body);
	},
	delete: async (path: string): Promise<void> => {
		await send(path, "DELETE", undefined);
	},
};
