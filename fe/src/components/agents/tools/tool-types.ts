import type { ToolDraft } from "#/components/agents/agent-form-model";
import type { ToolType } from "#/lib/api/schemas";
import {
	MAX_RETRIES,
	MAX_TIMEOUT_MS,
	MIN_TIMEOUT_MS,
} from "#/lib/http-contract";

// What each tool type is called and how its shared options read. Labels and
// descriptions follow the backend connector registry
// (api/src/app/api/api/src/app/domains/primitives/registry.py).
export const TOOL_TYPES: Record<
	ToolType,
	{
		label: string;
		description: string;
		urlLabel: string;
		urlPlaceholder: string;
		retriesHint: string;
		timeoutHint: string;
	}
> = {
	http: {
		label: "HTTP request",
		description: "Call an HTTP API endpoint with a fixed method and URL.",
		urlLabel: "URL",
		urlPlaceholder: "https://api.github.com/repos/acme/web/issues",
		retriesHint: `Extra attempts if the request fails, 0 to ${MAX_RETRIES}.`,
		timeoutHint: `How long one request may take, ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS} ms.`,
	},
	mcp: {
		label: "MCP server",
		description: "Use tools from a remote MCP server you provide.",
		urlLabel: "Server URL",
		urlPlaceholder: "https://mcp.example.com/mcp",
		retriesHint: `Applies to connecting to the server only, 0 to ${MAX_RETRIES}.`,
		timeoutHint: `Applies to each tool call, ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS} ms.`,
	},
};

export const TOOL_TYPE_ORDER: ToolType[] = ["http", "mcp"];

// Props shared by the per-tool field groups. `error` looks up this tool's
// error for one field; `onChange` patches this tool's draft.
export type ToolFieldsProps = {
	tool: ToolDraft;
	readOnly: boolean;
	error: (field: string) => string | undefined;
	onChange: (patch: Partial<ToolDraft>) => void;
};

export const toolFieldId = (tool: ToolDraft, field: string) =>
	`tool-${tool.key}-${field}`;
