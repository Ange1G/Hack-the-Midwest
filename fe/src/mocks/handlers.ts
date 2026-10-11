import { HttpResponse, http } from "msw";
import type { z } from "zod";
import { API_BASE_URL, DEV_USER_HEADER } from "#/lib/api/client";
import {
	type Agent,
	type AgentConfigurations,
	agentInputSchema,
	connectorCreateSchema,
	type Pagination,
	type Run,
} from "#/lib/api/schemas";
import { advanceRun, createAgent, createConnector, createRun, mockState, now } from "./state";

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

function requestValidationError(issues: z.core.$ZodIssue[]) {
	return fail(422, "validation_error", "Request validation failed", {
		errors: issues.map((issue) => ({
			loc: ["body", ...issue.path.map(String)],
			msg: issue.message,
			type: issue.code,
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

function withLastRun(agent: Agent): Agent {
	const latest = newestFirst(
		mockState.runs.filter((run) => run.agent_id === agent.id),
	)[0];
	if (!latest) return agent;
	return {
		...agent,
		last_run: {
			id: latest.id,
			status: latest.status,
			created_at: latest.created_at,
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
	http.get(url("/agents/:sso"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const items = newestFirst(
			mockState.agents
				.filter((agent) => agent.owner_user_sso === owner)
				.map((agent) => withLastRun(agent)),
		);
		const page = paginate(items, request);
		return ok(page.data, { pagination: page.pagination });
	}),

	http.post(url("/agents/:sso"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const raw = await request.json();
		const asForm = agentInputSchema.safeParse(raw);
		if (asForm.success) {
			return ok(createAgent(owner, asForm.data), { status: 201 });
		}
		const body = raw as {
			agentTitle?: string;
			systemPrompt?: string;
			configurations?: {
				primitives?: AgentConfigurations["primitives"];
				month?: number | null;
				dayOfWeek?: number[];
				timeOfDay?: number[];
			};
		};
		if (!body?.agentTitle?.trim() || !body?.systemPrompt?.trim()) {
			return requestValidationError(asForm.error.issues);
		}
		const timestamp = now();
		const agent: Agent = {
			id: `agt_${++mockState.counter}`,
			title: body.agentTitle.trim(),
			system_prompt: body.systemPrompt.trim(),
			configurations: {
				primitives: body.configurations?.primitives ?? {},
				...(body.configurations?.month != null
					? { month: body.configurations.month }
					: {}),
				dayOfWeek: body.configurations?.dayOfWeek ?? [],
				timeOfDay: body.configurations?.timeOfDay ?? [],
			},
			schedule_month: null,
			schedule_day: null,
			schedule_time: null,
			owner_user_sso: owner,
			created_at: timestamp,
			updated_at: timestamp,
			flagged: false,
			last_run: null,
		};
		mockState.agents.push(agent);
		return ok(agent, { status: 201 });
	}),

	http.get(url("/agents/:sso/executions"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const items = newestFirst(
			mockState.runs.filter((run) => {
				const agent = ownAgent(owner, run.agent_id);
				return agent !== undefined;
			}),
		);
		const page = paginate(items, request);
		return ok(page.data, { pagination: page.pagination });
	}),

	http.get(url("/agents/:sso/executions/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const run = ownRun(owner, String(params.id));
		if (!run) return notFound();
		advanceRun(run);
		return ok(run);
	}),

	http.get(url("/agents/:sso/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		return agent ? ok(withLastRun(agent)) : notFound();
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

	http.post(url("/agents/:sso/:id/executions"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		if (!agent) return notFound();
		return ok(createRun(agent), { status: 202 });
	}),

	http.get(url("/connectors/:sso"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const items = newestFirst(
			mockState.connectors.filter((item) => item.owner_user_sso === owner),
		);
		const page = paginate(items, request);
		return ok(page.data, { pagination: page.pagination });
	}),

	http.post(url("/connectors/:sso"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const parsed = connectorCreateSchema.safeParse(await request.json());
		if (!parsed.success) {
			return fail(422, "invalid_connector", "Connector contract is invalid", {
				errors: parsed.error.issues.map((issue) => ({
					field: issue.path.map(String).join("."),
					message: issue.message,
				})),
			});
		}
		try {
			return ok(createConnector(owner, parsed.data), { status: 201 });
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "connector_name_taken"
			) {
				return fail(
					409,
					"connector_name_taken",
					`You already have a connector named '${parsed.data.name}'`,
				);
			}
			throw error;
		}
	}),
];
