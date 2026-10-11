import type { AgentTemplate, Integration } from "#/lib/api/schemas";

// Mirrors api/src/app/domains/integrations/catalog.py for mock mode and tests.
export const mockIntegrations: Integration[] = [
	{
		id: "exa",
		name: "Exa web search",
		vendor: "Exa",
		category: "search",
		description:
			"Search the live web and read pages as clean text. Works without a key on free rate limits; add a key for your own quota.",
		docs_url: "https://docs.exa.ai/reference/exa-mcp",
		api_key_url: "https://dashboard.exa.ai/api-keys",
		connector_type: "mcp",
		connector_name: "exa_search",
		url: "https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa",
		api_key_required: false,
		tools: ["web_search_exa", "web_fetch_exa"],
		default_allowed_tools: ["web_search_exa", "web_fetch_exa"],
	},
	{
		id: "agenty",
		name: "Agenty browser tools",
		vendor: "Agenty",
		category: "scrape",
		description:
			"Render pages in a real browser: Markdown conversion, link lists, CSS or XPath extraction, sitemaps and more.",
		docs_url: "https://mcpservers.org/servers/agenty-mcp",
		api_key_url: "https://agenty.ai",
		connector_type: "mcp",
		connector_name: "agenty",
		url: "https://api.agenty.ai/mcp",
		api_key_required: true,
		tools: [
			"markdown",
			"links",
			"extract",
			"scrape",
			"content",
			"sitemap",
			"snapshot",
			"screenshot",
			"pdf",
			"redirects",
			"emails",
		],
		default_allowed_tools: ["markdown", "links", "extract"],
	},
	{
		id: "agentql",
		name: "AgentQL extraction",
		vendor: "AgentQL",
		category: "extract",
		description:
			"Turn any public web page into structured JSON from a natural-language prompt or an AgentQL query.",
		docs_url: "https://docs.agentql.com/rest-api/api-reference",
		api_key_url: "https://dev.agentql.com",
		connector_type: "http",
		connector_name: "agentql",
		url: "https://api.agentql.com/v1/query-data",
		api_key_required: true,
		tools: ["url", "prompt", "query"],
		default_allowed_tools: [],
	},
];

export const mockAgentTemplates: AgentTemplate[] = [
	{
		id: "research_assistant",
		name: "Research assistant",
		description:
			"Searches the web with Exa and answers with numbered citations.",
		title: "Research assistant",
		system_prompt:
			"You are a careful research assistant. Use exa_search__web_search_exa to find 3-6 relevant sources, cite every claim with [n], and end with a Sources list.",
		integrations: ["exa"],
		allowed_tools: { exa: ["web_search_exa", "web_fetch_exa"] },
		memory: false,
		suggested_input: "What changed in the latest Python release?",
	},
	{
		id: "web_data_extractor",
		name: "Web data extractor",
		description: "Pulls structured JSON from a page with AgentQL.",
		title: "Web data extractor",
		system_prompt:
			'You extract structured data from web pages. Call the agentql tool with {"url": <url>, "prompt": <description>} and return the JSON.',
		integrations: ["agentql"],
		allowed_tools: {},
		memory: false,
		suggested_input:
			"https://news.ycombinator.com - the top 5 stories with title, points and link",
	},
	{
		id: "page_watcher",
		name: "Page watcher",
		description:
			"Reads a page with Agenty and uses memory to report what changed since the last run.",
		title: "Page watcher",
		system_prompt:
			"You watch a web page for meaningful changes. Load your previous summary with memory_get, read the page with agenty__markdown, report what changed, then save the new summary with memory_set.",
		integrations: ["agenty"],
		allowed_tools: { agenty: ["markdown"] },
		memory: true,
		suggested_input: "https://example.com/changelog",
	},
];
