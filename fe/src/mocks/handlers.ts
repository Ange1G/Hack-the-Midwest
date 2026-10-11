import { HttpResponse, http } from "msw";
import type { z } from "zod";
import { API_BASE_URL, DEV_USER_HEADER } from "#/lib/api/client";
import {
	type Agent,
	agentInputSchema,
	agentUpdateSchema,
	chainCreateSchema,
	connectorCreateSchema,
	connectorTypeCatalogSchema,
	executionCreateSchema,
	type Pagination,
	type Run,
	webhookCreateSchema,
} from "#/lib/api/schemas";
import {
	advanceChainRun,
	advanceRun,
	chainRunSummary,
	createChain,
	createChainRun,
	createConnector,
	createRun,
	createWebhook,
	insertAgent,
	maskedWebhook,
	mockState,
	updateAgent,
} from "./state";

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
		const parsed = agentInputSchema.safeParse(await request.json());
		if (!parsed.success) return requestValidationError(parsed.error.issues);
		return ok(insertAgent(owner, parsed.data), { status: 201 });
	}),

	http.patch(url("/agents/:sso/:id"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		if (!agent) return notFound();
		const parsed = agentUpdateSchema.safeParse(await request.json());
		if (!parsed.success) return requestValidationError(parsed.error.issues);
		return ok(updateAgent(agent, parsed.data));
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

	http.post(url("/agents/:sso/:id/executions"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const agent = ownAgent(owner, String(params.id));
		if (!agent) return notFound();
		let input: string | null = null;
		const raw = await request.text();
		if (raw.trim()) {
			const parsed = executionCreateSchema.safeParse(JSON.parse(raw));
			if (!parsed.success) {
				return requestValidationError(parsed.error.issues);
			}
			input = parsed.data.input ?? null;
		}
		return ok(createRun(agent, input), { status: 202 });
	}),

	http.get(url("/connector-types"), ({ request }) => {
		if (!caller(request)) return unauthorized();
		return ok(
			connectorTypeCatalogSchema.array().parse([
				{
					type: "http",
					name: "HTTP request",
					description: "Call an HTTP API endpoint with a fixed method and URL.",
					credential_fields: ["xApiKey", "authorizationHeader"],
					config_schema: {},
				},
				{
					type: "mcp",
					name: "MCP server",
					description: "Use tools from a remote MCP server you provide.",
					credential_fields: ["xApiKey", "authorizationHeader"],
					config_schema: {},
				},
				{
					type: "database",
					name: "Database",
					description:
						"Use a PostgreSQL, MySQL, MongoDB or Redis database: one you run, or one the platform starts for the agent.",
					credential_fields: ["username", "password"],
					config_schema: {},
				},
			]),
		);
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

	http.get(url("/webhooks/:sso"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const items = newestFirst(
			mockState.webhooks
				.filter((item) => item.owner_user_sso === owner)
				.map(maskedWebhook),
		);
		const page = paginate(items, request);
		return ok(page.data, { pagination: page.pagination });
	}),

	http.post(url("/webhooks/:sso"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const parsed = webhookCreateSchema.safeParse(await request.json());
		if (!parsed.success) return requestValidationError(parsed.error.issues);
		if (parsed.data.target_type === "chain") {
			const chain = mockState.chains.find(
				(item) =>
					item.id === parsed.data.target_chain_id &&
					item.owner_user_sso === owner,
			);
			if (!chain) return fail(404, "not_found", "Chain not found");
		} else if (!ownAgent(owner, parsed.data.target_agent_id ?? "")) {
			return fail(404, "not_found", "Agent not found");
		}
		return ok(createWebhook(owner, parsed.data), { status: 201 });
	}),

	http.delete(url("/webhooks/:sso/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const webhook = mockState.webhooks.find(
			(item) => item.id === String(params.id) && item.owner_user_sso === owner,
		);
		if (!webhook) return notFound();
		mockState.webhooks = mockState.webhooks.filter((item) => item !== webhook);
		mockState.webhookSecrets.delete(webhook.id);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(url("/chains/:sso"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const items = newestFirst(
			mockState.chains.filter((item) => item.owner_user_sso === owner),
		);
		const page = paginate(items, request);
		return ok(page.data, { pagination: page.pagination });
	}),

	http.post(url("/chains/:sso"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const parsed = chainCreateSchema.safeParse(await request.json());
		if (!parsed.success) return requestValidationError(parsed.error.issues);
		for (const step of parsed.data.steps) {
			if (!ownAgent(owner, step.agent_id)) {
				return fail(422, "invalid_chain", "Chain definition is invalid", {
					errors: [{ field: "steps.0.agent_id", message: "Agent not found" }],
				});
			}
		}
		return ok(createChain(owner, parsed.data), { status: 201 });
	}),

	http.get(url("/chains/:sso/runs/:runId"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const run = mockState.chainRuns.find(
			(item) =>
				item.id === String(params.runId) && item.owner_user_sso === owner,
		);
		if (!run) return notFound();
		if (run.status === "running") advanceChainRun(run);
		return ok(chainRunSummary(run));
	}),

	http.get(url("/chains/:sso/runs/:runId/steps"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const run = mockState.chainRuns.find(
			(item) =>
				item.id === String(params.runId) && item.owner_user_sso === owner,
		);
		if (!run) return notFound();
		return ok(mockState.chainRunSteps.get(run.id) ?? []);
	}),

	http.get(url("/chains/:sso/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const chain = mockState.chains.find(
			(item) => item.id === String(params.id) && item.owner_user_sso === owner,
		);
		return chain ? ok(chain) : notFound();
	}),

	http.delete(url("/chains/:sso/:id"), ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const chain = mockState.chains.find(
			(item) => item.id === String(params.id) && item.owner_user_sso === owner,
		);
		if (!chain) return notFound();
		mockState.chains = mockState.chains.filter((item) => item !== chain);
		return new HttpResponse(null, { status: 204 });
	}),

	http.post(url("/chains/:sso/:id/runs"), async ({ request, params }) => {
		const owner = caller(request);
		if (!owner) return unauthorized();
		if (owner !== String(params.sso)) return forbidden();
		const chain = mockState.chains.find(
			(item) => item.id === String(params.id) && item.owner_user_sso === owner,
		);
		if (!chain) return notFound();
		let input: string | null = null;
		const raw = await request.text();
		if (raw.trim()) {
			const parsed = executionCreateSchema.safeParse(JSON.parse(raw));
			if (!parsed.success) return requestValidationError(parsed.error.issues);
			input = parsed.data.input ?? null;
		}
		return ok(createChainRun(chain, input), { status: 202 });
	}),
];
