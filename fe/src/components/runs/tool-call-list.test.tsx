import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToolCallList } from "./tool-call-list";

const toolCalls = [
	{
		name: "exa_search__web_search_exa",
		kind: "mcp",
		ok: true,
		duration_ms: 640,
		status: "ok",
		arguments: '{"query":"python 3.14"}',
		response_body: '{"results":[{"url":"https://docs.python.org/3/"}]}',
	},
	{
		name: "agentql",
		kind: "http",
		ok: false,
		duration_ms: 1200,
		status: "HTTP 429",
		URL: "https://api.agentql.com/v1/query-data",
	},
	{ name: "memory_set", kind: "memory", ok: true, duration_ms: 1 },
];

describe("ToolCallList", () => {
	it("summarises calls by kind, external usage, and failures", () => {
		render(<ToolCallList toolCalls={toolCalls} live={false} />);
		const kinds = screen.getByRole("list", { name: "Tool calls by kind" });
		expect(within(kinds).getByText(/HTTP/)).toHaveTextContent("HTTP ×1");
		expect(within(kinds).getByText(/MCP/)).toHaveTextContent("MCP ×1");
		expect(within(kinds).getByText(/Memory/)).toHaveTextContent("Memory ×1");
		expect(screen.getByText(/External calls:/).parentElement).toHaveTextContent(
			"External calls: agentql ×1 · exa_search ×1",
		);
		expect(screen.getByText(/1 failed/)).toBeInTheDocument();
		expect(screen.getByText("HTTP 429")).toBeInTheDocument();
	});

	it("links sources safely in a new tab", () => {
		render(
			<ToolCallList
				toolCalls={toolCalls}
				output="See https://peps.python.org/pep-0745/"
				live={false}
			/>,
		);
		const links = screen.getAllByRole("link");
		expect(links.map((link) => link.getAttribute("href"))).toEqual([
			"https://peps.python.org/pep-0745/",
			"https://docs.python.org/3/",
		]);
		for (const link of links) {
			expect(link).toHaveAttribute("target", "_blank");
			expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
		}
	});

	it("expands a call to show its arguments and response", async () => {
		const user = userEvent.setup();
		render(<ToolCallList toolCalls={toolCalls} live={false} />);
		await user.click(screen.getByText("exa_search__web_search_exa"));
		expect(screen.getByText('{"query":"python 3.14"}')).toBeVisible();
	});

	it("reports memory writes, including keys dropped for space", () => {
		render(
			<ToolCallList
				toolCalls={[]}
				live={false}
				memoryWrites={{ set: ["summary"], deleted: ["old"], dropped: ["x"] }}
			/>,
		);
		expect(screen.getByText("Memory updated")).toBeInTheDocument();
		expect(screen.getByText("summary")).toBeInTheDocument();
		expect(screen.getByText("old")).toBeInTheDocument();
		expect(screen.getByText(/memory full/)).toBeInTheDocument();
		expect(
			screen.getByText("No tool calls were recorded."),
		).toBeInTheDocument();
	});
});
