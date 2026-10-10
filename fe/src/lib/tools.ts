import type { ToolConfig } from "#/lib/api/schemas";

// Stable React key for a configured tool. Two identical tools on one agent
// would collide, which is also the one case where showing both adds nothing.
export function toolKey(tool: ToolConfig): string {
	return `${tool.kind}:${JSON.stringify(tool.config)}`;
}
