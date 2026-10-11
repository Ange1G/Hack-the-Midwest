// Shape of `result.tool_calls` entries the runner records (runner/tool_calls.py).
// Older runs predate `kind`/`ok`/`duration_ms`, so every field is optional.

export const TOOL_CALL_KINDS = [
	"http",
	"mcp",
	"database",
	"knowledge",
	"memory",
	"delegate",
	"notification",
	"tool",
] as const;
export type ToolCallKind = (typeof TOOL_CALL_KINDS)[number];

export type ToolCall = {
	name: string;
	kind: ToolCallKind;
	ok: boolean;
	status: string | null;
	durationMs: number | null;
	arguments: string | null;
	responseBody: string | null;
	url: string | null;
	delegate: string | null;
};

const KIND_LABELS: Record<ToolCallKind, string> = {
	http: "HTTP",
	mcp: "MCP",
	database: "Database",
	knowledge: "Knowledge",
	memory: "Memory",
	delegate: "Delegate",
	notification: "Notification",
	tool: "Tool",
};

// Calls that reach a third-party service and may cost money or quota.
const EXTERNAL_KINDS: ReadonlySet<ToolCallKind> = new Set([
	"http",
	"mcp",
	"notification",
]);

export const MAX_SOURCES = 12;
const URL_PATTERN = /https?:\/\/[^\s"'<>`()[\]{}]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?*_]+$/;

export function toolCallKindLabel(kind: ToolCallKind): string {
	return KIND_LABELS[kind];
}

function text(value: unknown): string | null {
	return typeof value === "string" && value ? value : null;
}

export function inferKind(raw: Record<string, unknown>): ToolCallKind {
	const kind = raw.kind;
	if (
		typeof kind === "string" &&
		(TOOL_CALL_KINDS as readonly string[]).includes(kind)
	) {
		return kind as ToolCallKind;
	}
	const name = text(raw.name) ?? "";
	if ("mcp_tool" in raw) return "mcp";
	if ("engine" in raw) return "database";
	if ("method" in raw) return "http";
	if (name.startsWith("memory_")) return "memory";
	if (name.startsWith("ask_")) return "delegate";
	return "tool";
}

function okFrom(raw: Record<string, unknown>): boolean {
	if (typeof raw.ok === "boolean") return raw.ok;
	const status = text(raw.status) ?? "";
	if (status.startsWith("error")) return false;
	const match = /^HTTP (\d{3})/.exec(status);
	return match ? Number(match[1]) < 400 : true;
}

export function parseToolCalls(raw: unknown[] | null | undefined): ToolCall[] {
	if (!raw) return [];
	return raw.flatMap((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) return [];
		const record = item as Record<string, unknown>;
		const duration = record.duration_ms;
		return [
			{
				name: text(record.name) ?? "tool",
				kind: inferKind(record),
				ok: okFrom(record),
				status: text(record.status),
				durationMs:
					typeof duration === "number" && Number.isFinite(duration)
						? duration
						: null,
				arguments: text(record.arguments),
				responseBody: text(record.response_body),
				url: text(record.URL),
				delegate: text(record.delegate),
			},
		];
	});
}

export function toolCallCounts(
	calls: ToolCall[],
): Array<{ kind: ToolCallKind; count: number }> {
	const counts = new Map<ToolCallKind, number>();
	for (const call of calls) {
		counts.set(call.kind, (counts.get(call.kind) ?? 0) + 1);
	}
	return TOOL_CALL_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({
		kind,
		count: counts.get(kind) ?? 0,
	}));
}

function connectorOf(call: ToolCall): string {
	// MCP tools are registered as `<connector>__<tool>`.
	return call.kind === "mcp"
		? (call.name.split("__")[0] ?? call.name)
		: call.name;
}

/** External calls per connector, most-used first: the run's cost hint. */
export function externalCallCounts(
	calls: ToolCall[],
): Array<{ connector: string; count: number }> {
	const counts = new Map<string, number>();
	for (const call of calls) {
		if (!EXTERNAL_KINDS.has(call.kind)) continue;
		const connector = connectorOf(call);
		counts.set(connector, (counts.get(connector) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([connector, count]) => ({ connector, count }))
		.sort(
			(a, b) => b.count - a.count || a.connector.localeCompare(b.connector),
		);
}

export function totalDurationMs(calls: ToolCall[]): number {
	return calls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0);
}

function originOf(value: string): string | null {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

function normalizeUrl(candidate: string): string | null {
	const trimmed = candidate.replace(TRAILING_PUNCTUATION, "");
	try {
		const url = new URL(trimmed);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		return url.toString();
	} catch {
		return null;
	}
}

/**
 * Links the agent cited or read: URLs in the output first, then in tool
 * responses. Tool endpoints themselves (an MCP server, an API base) are not
 * sources, so their origins are skipped.
 */
export function extractSources(
	output: string | null | undefined,
	calls: ToolCall[],
	limit = MAX_SOURCES,
): string[] {
	const endpointOrigins = new Set(
		calls.flatMap((call) => {
			const origin = call.url ? originOf(call.url) : null;
			return origin ? [origin] : [];
		}),
	);
	const texts = [output ?? "", ...calls.map((call) => call.responseBody ?? "")];
	const seen = new Set<string>();
	const sources: string[] = [];
	for (const body of texts) {
		for (const match of body.matchAll(URL_PATTERN)) {
			const url = normalizeUrl(match[0]);
			if (!url || seen.has(url)) continue;
			const origin = originOf(url);
			if (origin && endpointOrigins.has(origin)) continue;
			seen.add(url);
			sources.push(url);
			if (sources.length >= limit) return sources;
		}
	}
	return sources;
}
