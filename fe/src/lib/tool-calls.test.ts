import { describe, expect, it } from "vitest";
import {
	externalCallCounts,
	extractSources,
	MAX_SOURCES,
	parseToolCalls,
	toolCallCounts,
	totalDurationMs,
} from "./tool-calls";

describe("parseToolCalls", () => {
	it("reads the runner's kind, ok, duration and delegate fields", () => {
		const [call] = parseToolCalls([
			{
				name: "exa_search__web_search_exa",
				kind: "mcp",
				ok: false,
				duration_ms: 812,
				status: "error: timeout",
				arguments: '{"query":"python"}',
				delegate: "Researcher",
			},
		]);
		expect(call).toMatchObject({
			name: "exa_search__web_search_exa",
			kind: "mcp",
			ok: false,
			durationMs: 812,
			arguments: '{"query":"python"}',
			delegate: "Researcher",
		});
	});

	it("infers kind and outcome for runs recorded before those fields existed", () => {
		const calls = parseToolCalls([
			{ name: "github__list", mcp_tool: "list" },
			{ name: "orders", engine: "postgres" },
			{ name: "status", method: "GET", status: "HTTP 503" },
			{ name: "memory_set" },
			{ name: "ask_researcher" },
			{ name: "mystery" },
		]);
		expect(calls.map((call) => call.kind)).toEqual([
			"mcp",
			"database",
			"http",
			"memory",
			"delegate",
			"tool",
		]);
		expect(calls[2]?.ok).toBe(false);
		expect(calls[0]?.ok).toBe(true);
	});

	it("skips entries that are not objects", () => {
		expect(parseToolCalls([null, "x", 3, ["a"]])).toEqual([]);
		expect(parseToolCalls(undefined)).toEqual([]);
	});
});

describe("tool call summaries", () => {
	const calls = parseToolCalls([
		{ name: "exa_search__web_search_exa", kind: "mcp", duration_ms: 300 },
		{ name: "exa_search__web_fetch_exa", kind: "mcp", duration_ms: 200 },
		{ name: "agentql", kind: "http", duration_ms: 1000 },
		{ name: "docs__search", kind: "knowledge", duration_ms: 4 },
		{ name: "memory_get", kind: "memory" },
	]);

	it("counts calls per kind in a stable order", () => {
		expect(toolCallCounts(calls)).toEqual([
			{ kind: "http", count: 1 },
			{ kind: "mcp", count: 2 },
			{ kind: "knowledge", count: 1 },
			{ kind: "memory", count: 1 },
		]);
	});

	it("groups external calls by connector, most used first", () => {
		expect(externalCallCounts(calls)).toEqual([
			{ connector: "exa_search", count: 2 },
			{ connector: "agentql", count: 1 },
		]);
	});

	it("sums recorded durations", () => {
		expect(totalDurationMs(calls)).toBe(1504);
	});
});

describe("extractSources", () => {
	it("lists cited URLs from the output before tool responses, without duplicates", () => {
		const calls = parseToolCalls([
			{
				name: "exa_search__web_search_exa",
				kind: "mcp",
				response_body:
					'{"results":[{"url":"https://docs.python.org/3/whatsnew/3.14.html"},{"url":"https://peps.python.org/pep-0745/"}]}',
			},
		]);
		const output =
			"Python 3.14 shipped [1].\n\nSources\n[1] What's new - https://docs.python.org/3/whatsnew/3.14.html.";
		expect(extractSources(output, calls)).toEqual([
			"https://docs.python.org/3/whatsnew/3.14.html",
			"https://peps.python.org/pep-0745/",
		]);
	});

	it("skips the tool endpoints themselves and non-web schemes", () => {
		const calls = parseToolCalls([
			{
				name: "agentql",
				kind: "http",
				URL: "https://api.agentql.com/v1/query-data",
				response_body:
					"see https://api.agentql.com/docs and javascript:alert(1) and https://news.ycombinator.com/item?id=1",
			},
		]);
		expect(extractSources(null, calls)).toEqual([
			"https://news.ycombinator.com/item?id=1",
		]);
	});

	it("caps the list", () => {
		const output = Array.from(
			{ length: MAX_SOURCES + 5 },
			(_, index) => `https://example.com/${index}`,
		).join(" ");
		expect(extractSources(output, [])).toHaveLength(MAX_SOURCES);
	});
});
