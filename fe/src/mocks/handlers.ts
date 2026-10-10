import { HttpResponse, http } from "msw";
import type { ZodError } from "zod";
import { API_BASE_URL } from "#/lib/api/client";
import type { User } from "#/lib/api/schemas";
import { agentInputSchema, credentialsSchema } from "#/lib/api/schemas";
import {
	advanceRun,
	createAgent,
	createRun,
	createUser,
	type MockAgent,
	mockState,
	now,
	publicAgent,
	publicUser,
	toolDefinitions,
} from "./state";

// Handlers implementing API contract v0 for development and tests.
// See spec/2026-10-10-frontend-dashboard/plan.md.

const url = (path: string) => `${API_BASE_URL}${path}`;

function error(
	status: number,
	code: string,
	message: string,
	fields?: Record<string, string>,
) {
	return HttpResponse.json(
		{ error: { code, message, ...(fields ? { fields } : {}) } },
		{ status },
	);
}

function fieldErrors(zodError: ZodError): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const issue of zodError.issues) {
		const key = issue.path.join(".") || "_";
		if (!(key in fields)) fields[key] = issue.message;
	}
	return fields;
}

const unauthenticated = () =>
	error(401, "unauthenticated", "Sign in to continue.");
const notFound = () => error(404, "not_found", "Not found.");

function ownAgent(user: User, id: string): MockAgent | undefined {
	return mockState.agents.find(
		(agent) => agent.id === id && agent.owner_id === user.id,
	);
}

function ownRun(user: User, id: string) {
	const run = mockState.runs.find((item) => item.id === id);
	if (!run) return undefined;
	return ownAgent(user, run.agent_id) ? run : undefined;
}

export const handlers = [
	http.post(url("/auth/signup"), async ({ request }) => {
		const parsed = credentialsSchema.safeParse(await request.json());
		if (!parsed.success) {
			return error(
				422,
				"validation_error",
				"Check the highlighted fields.",
				fieldErrors(parsed.error),
			);
		}
		if (mockState.users.some((user) => user.email === parsed.data.email)) {
			return error(
				409,
				"email_taken",
				"An account with that email already exists.",
			);
		}
		const user = createUser(parsed.data.email, parsed.data.password);
		mockState.session = publicUser(user);
		return HttpResponse.json(publicUser(user), { status: 201 });
	}),

	http.post(url("/auth/login"), async ({ request }) => {
		const parsed = credentialsSchema.safeParse(await request.json());
		if (!parsed.success) {
			return error(
				401,
				"invalid_credentials",
				"Email or password is incorrect.",
			);
		}
		let user = mockState.users.find((item) => item.email === parsed.data.email);
		if (user && user.password !== parsed.data.password) {
			return error(
				401,
				"invalid_credentials",
				"Email or password is incorrect.",
			);
		}
		// Mock convenience: an unknown email with a well-formed password signs in
		// as a new account so the demo never dead-ends on a login screen.
		if (!user) user = createUser(parsed.data.email, parsed.data.password);
		mockState.session = publicUser(user);
		return HttpResponse.json(publicUser(user));
	}),

	http.post(url("/auth/logout"), () => {
		mockState.session = null;
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(url("/auth/me"), () => {
		const user = mockState.session;
		return user ? HttpResponse.json(user) : unauthenticated();
	}),

	http.get(url("/tools"), () => {
		if (!mockState.session) return unauthenticated();
		return HttpResponse.json({ items: toolDefinitions });
	}),

	http.get(url("/agents"), () => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const items = mockState.agents
			.filter((agent) => agent.owner_id === user.id)
			.map(publicAgent);
		return HttpResponse.json({ items });
	}),

	http.post(url("/agents"), async ({ request }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const parsed = agentInputSchema.safeParse(await request.json());
		if (!parsed.success) {
			return error(
				422,
				"validation_error",
				"Check the highlighted fields.",
				fieldErrors(parsed.error),
			);
		}
		const agent = createAgent(user, parsed.data);
		return HttpResponse.json(publicAgent(agent), { status: 201 });
	}),

	http.get(url("/agents/:id"), ({ params }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const agent = ownAgent(user, String(params.id));
		return agent ? HttpResponse.json(publicAgent(agent)) : notFound();
	}),

	http.delete(url("/agents/:id"), ({ params }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const agent = ownAgent(user, String(params.id));
		if (!agent) return notFound();
		mockState.agents = mockState.agents.filter((item) => item !== agent);
		return new HttpResponse(null, { status: 204 });
	}),

	http.get(url("/agents/:id/runs"), ({ params }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const agent = ownAgent(user, String(params.id));
		if (!agent) return notFound();
		const items = mockState.runs
			.filter((run) => run.agent_id === agent.id)
			.slice()
			.reverse();
		return HttpResponse.json({ items });
	}),

	http.post(url("/agents/:id/runs"), ({ params }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const agent = ownAgent(user, String(params.id));
		if (!agent) return notFound();
		const run = createRun(agent);
		return HttpResponse.json(run, { status: 202 });
	}),

	http.get(url("/runs/:id"), ({ params }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const run = ownRun(user, String(params.id));
		if (!run) return notFound();
		advanceRun(run);
		return HttpResponse.json(run);
	}),

	http.get(url("/runs/:id/events"), ({ params }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const run = ownRun(user, String(params.id));
		if (!run) return notFound();
		const items = mockState.events.filter((event) => event.run_id === run.id);
		return HttpResponse.json({ items });
	}),

	http.post(url("/runs/:id/cancel"), ({ params }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const run = ownRun(user, String(params.id));
		if (!run) return notFound();
		if (run.status === "queued" || run.status === "running") {
			run.status = "cancelled";
			run.finished_at = now();
		}
		return HttpResponse.json(run);
	}),

	http.get(url("/security/findings"), ({ request }) => {
		const user = mockState.session;
		if (!user) return unauthenticated();
		const search = new URL(request.url).searchParams;
		const agentId = search.get("agent_id");
		const runId = search.get("run_id");
		const items = mockState.findings.filter(
			(finding) =>
				ownAgent(user, finding.agent_id) !== undefined &&
				(agentId === null || finding.agent_id === agentId) &&
				(runId === null || finding.run_id === runId),
		);
		return HttpResponse.json({ items });
	}),
];
