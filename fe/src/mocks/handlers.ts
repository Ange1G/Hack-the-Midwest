import { HttpResponse, http } from "msw";
import type { z } from "zod";
import { API_BASE_URL, DEV_USER_HEADER } from "#/lib/api/client";
import {
	type Agent,
	agentInputSchema,
	type Pagination,
	type Run,
} from "#/lib/api/schemas";
import { advanceRun, createAgent, createRun, mockState, now } from "./state";

// Mirrors the backend (envelope, /api/v1, X-Dev-User-SSO, pagination, error
// codes, credential masking) for the endpoints it implements, and extends it
// with the endpoints proposed in spec/2026-10-10-frontend-dashboard/plan.md.

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const url = (path: string) => `${API_BASE_URL}${path}`;

let requestCounter = 0;
function metadata() {
	requestCounter += 1;
	return { request_id: `mock-${requestCounter}` };
}

function ok<T>(
	data: T,
	init: { status?: number; pagination?: Pagination | null } = {},
) {
	return HttpResponse.json(
		{
			data,
			error: null,
			metadata: metadata(),
			pagination: init.pagination ?? null,
		},
		{ status: init.status ?? 200 },
	);
}

function fail(
	status: number,
	code: string,
	message: string,
	details: Record<string, unknown> | null = null,
) {
	return HttpResponse.json(
		{
			data: null,
			error: { code, message, details },
			metadata: metadata(),
			pagination: null,
		},
		{ status },
	);
}

const unauthorized = () =>
	fail(
		401,
		"unauthorized",
		"Missing X-Dev-User-SSO header (required in development/test)",
	);
const forbidden = () =>
	fail(403, "forbidden", "You may not access agents for another user");
const notFound = () => fail(404, "not_found", "Not found.");

// FastAPI's request validation shape: pydantic issues with loc and msg.
function requestValidationError(issues: z.core.$ZodIssue[]) {
	return fail(422, "validation_error", "Request validation failed", {
		errors: issues.map((issue) => ({
			loc: ["body", ...issue.path.map(String)],
			msg: issue.message,
			type: issue.code,
		})),
	});
}

// The agent service's shape: field path and message, never the value.
function configurationError(issues: z.core.$ZodIssue[]) {
	return fail(422, "invalid_configuration", "Agent configuration is invalid", {
		errors: issues.map((issue) => ({
			field: issue.path.map(String).join("."),
			message: issue.message,
		})),
	});
}

function caller(request: Request): string | null {
	return request.headers.get(DEV_USER_HEADER);
}

function paginate<T>(
	items: T[],
	request: Request,
): { data: T[]; pagination: Pagination } {
	const params = new URL(request.url).searchParams;
	const page = Math.max(1, Number(params.get("page")) || 1);
	const requested = Number(params.get("page_size")) || DEFAULT_PAGE_SIZE;
	const page_size = Math.min(Math.max(requested, 1), MAX_PAGE_SIZE);
	const total_items = items.length;
	const start = (page - 1) * page_size;
	return {
		data: items.slice(start, start + page_size),
		pagination: {
			page,
			page_size,
			total_items,
			total_pages: total_items === 0 ? 0 : Math.ceil(total_items / page_size),
		},
	};
}

function ownAgent(owner: string, id: string): Agent | undefined {
	return mockState.agents.find(
		(agent) => agent.id === id && agent.owner_user_sso === owner,
	);
}

function ownRun(owner: string, id: string): Run | undefined {
	const run = mockState.runs.find((item) => item.id === id);
	if (!run) return undefined;
	return ownAgent(owner, run.agent_id) ? run : undefined;
}

const newestFirst = <T extends { created_at: string }>(items: T[]) =>
	items.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));

export const handlers = [
	// Implemented in the backend.
	http.get(url("/agents/:sso"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const items = newestFirst(
			mockState.agents.filter((agent) => agent.owner_user_sso === owner),
		);
		const page = paginate(items, request);
		return ok(page.data, { pagination: page.pagination });
	}),

	// Implemented in the backend (feat/agent_create_http).
	http.post(url("/agents/:sso"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const parsed = agentInputSchema.safeParse(await request.json());
		if (!parsed.success) {
			const issues = parsed.error.issues;
			const bodyIssues = issues.filter(
				(issue) => issue.path[0] !== "configurations",
			);
			return bodyIssues.length > 0
				? requestValidationError(bodyIssues)
				: configurationError(issues);
		}
		return ok(createAgent(owner, parsed.data), { status: 201 });
	}),

	// Proposed.
	http.get(url("/agents/:sso/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		return agent ? ok(agent) : notFound();
	}),

	http.delete(url("/agents/:sso/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		if (!agent) return notFound();
		mockState.agents = mockState.agents.filter((item) => item !== agent);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(url("/agents/:sso/:id/runs"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		if (!agent) return notFound();
		const items = newestFirst(
			mockState.runs.filter((run) => run.agent_id === agent.id),
		);
		const page = paginate(items, request);
		return ok(page.data, { pagination: page.pagination });
	}),

	http.post(url("/agents/:sso/:id/runs"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		if (!agent) return notFound();
		return ok(createRun(agent), { status: 202 });
	}),

	http.get(url("/runs/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		const run = ownRun(owner, String(params.id));
		if (!run) return notFound();
		advanceRun(run);
		return ok(run);
	}),

	http.get(url("/runs/:id/events"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		const run = ownRun(owner, String(params.id));
		if (!run) return notFound();
		return ok(mockState.events.filter((event) => event.run_id === run.id));
	}),

	http.post(url("/runs/:id/cancel"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		const run = ownRun(owner, String(params.id));
		if (!run) return notFound();
		if (run.status === "queued" || run.status === "running") {
			run.status = "cancelled";
			run.finished_at = now();
		}
		return ok(run);
	}),
];
