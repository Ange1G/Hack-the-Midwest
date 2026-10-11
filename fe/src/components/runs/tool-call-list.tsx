import {
	ChevronRightIcon,
	CircleAlertIcon,
	CircleCheckIcon,
	ExternalLinkIcon,
} from "lucide-react";
import { useId } from "react";
import { type Tone, ToneBadge } from "#/components/tone-badge";
import {
	externalCallCounts,
	extractSources,
	parseToolCalls,
	type ToolCall,
	type ToolCallKind,
	toolCallCounts,
	toolCallKindLabel,
	totalDurationMs,
} from "#/lib/tool-calls";
import { cn } from "#/lib/utils";
import { OutputBlock } from "./output-block";

const KIND_TONE: Record<ToolCallKind, Tone> = {
	http: "neutral",
	mcp: "info",
	database: "neutral",
	knowledge: "success",
	memory: "warning",
	delegate: "info",
	notification: "warning",
	tool: "neutral",
};

export type MemoryWrites = {
	set?: string[];
	deleted?: string[];
	dropped?: string[];
};

function formatMs(ms: number): string {
	return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function hostLabel(url: string): string {
	try {
		const parsed = new URL(url);
		const path = parsed.pathname === "/" ? "" : parsed.pathname;
		return `${parsed.hostname}${path}`;
	} catch {
		return url;
	}
}

// What the agent did during a run: tool calls by kind, external calls per
// connector (a cost hint), the sources it read, and each call's details.
export function ToolCallList({
	toolCalls,
	output,
	live,
	memoryWrites,
}: {
	toolCalls: unknown[];
	output?: string | null;
	live: boolean;
	memoryWrites?: MemoryWrites | null;
}) {
	const headingId = useId();
	const calls = parseToolCalls(toolCalls);
	const sources = extractSources(output, calls);
	const memoryNote = memoryWrites ? (
		<MemoryWritesNote writes={memoryWrites} />
	) : null;

	if (calls.length === 0) {
		return (
			<div className="space-y-3">
				{memoryNote}
				{sources.length > 0 ? <SourceList sources={sources} /> : null}
				<p className="text-xs text-muted-foreground">
					{live
						? "Waiting for the first tool call…"
						: "No tool calls were recorded."}
				</p>
			</div>
		);
	}

	const counts = toolCallCounts(calls);
	const external = externalCallCounts(calls);
	const failed = calls.filter((call) => !call.ok).length;
	const duration = totalDurationMs(calls);

	return (
		<section aria-labelledby={headingId} className="space-y-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h3
					id={headingId}
					className="text-xs font-medium text-muted-foreground"
				>
					Tool calls <span className="tabular-nums">({calls.length})</span>
				</h3>
				<p className="text-xs text-muted-foreground tabular-nums">
					{failed > 0 ? `${failed} failed · ` : ""}
					{duration > 0 ? `${formatMs(duration)} in tools` : null}
				</p>
			</div>

			<ul className="flex flex-wrap gap-1.5" aria-label="Tool calls by kind">
				{counts.map(({ kind, count }) => (
					<li key={kind}>
						<ToneBadge tone={KIND_TONE[kind]}>
							{toolCallKindLabel(kind)}{" "}
							<span className="tabular-nums">×{count}</span>
						</ToneBadge>
					</li>
				))}
			</ul>

			{external.length > 0 ? (
				<p className="text-xs text-muted-foreground">
					<span className="font-medium text-foreground">External calls:</span>{" "}
					{external
						.map(({ connector, count }) => `${connector} ×${count}`)
						.join(" · ")}
				</p>
			) : null}

			{memoryNote}
			{sources.length > 0 ? <SourceList sources={sources} /> : null}

			<ol className="divide-y rounded-md border">
				{calls.map((call, index) => (
					<ToolCallRow
						// Calls have no id; order is stable for a finished run.
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
						key={index}
						call={call}
					/>
				))}
			</ol>

			<details className="group/raw">
				<summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
					<ChevronRightIcon
						className="size-3.5 transition-transform duration-150 group-open/raw:rotate-90"
						aria-hidden="true"
					/>
					Raw tool call JSON
				</summary>
				<OutputBlock
					className="mt-2"
					label="Tool calls"
					value={JSON.stringify(toolCalls, null, 2)}
				/>
			</details>
		</section>
	);
}

function ToolCallRow({ call }: { call: ToolCall }) {
	const hasDetails = Boolean(call.arguments || call.responseBody);
	const summary = (
		<>
			{call.ok ? (
				<CircleCheckIcon
					className="size-4 shrink-0 text-success"
					aria-hidden="true"
				/>
			) : (
				<CircleAlertIcon
					className="size-4 shrink-0 text-destructive"
					aria-hidden="true"
				/>
			)}
			<span className="sr-only">{call.ok ? "Succeeded:" : "Failed:"}</span>
			<ToneBadge tone={KIND_TONE[call.kind]} className="shrink-0">
				{toolCallKindLabel(call.kind)}
			</ToneBadge>
			<span className="min-w-0 truncate font-mono text-xs font-medium">
				{call.name}
			</span>
			{call.delegate ? (
				<span className="shrink-0 text-xs text-muted-foreground">
					via {call.delegate}
				</span>
			) : null}
			<span className="ml-auto flex min-w-0 shrink items-center gap-2 text-xs text-muted-foreground">
				{call.status ? (
					<span
						className={cn(
							"max-w-[16rem] truncate",
							!call.ok && "text-destructive",
						)}
						title={call.status}
					>
						{call.status}
					</span>
				) : null}
				{call.durationMs != null ? (
					<span className="shrink-0 tabular-nums">
						{formatMs(call.durationMs)}
					</span>
				) : null}
			</span>
		</>
	);

	if (!hasDetails) {
		return <li className="flex items-center gap-2 px-3 py-2">{summary}</li>;
	}
	return (
		<li>
			<details className="group/call">
				<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
					<ChevronRightIcon
						className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-open/call:rotate-90"
						aria-hidden="true"
					/>
					{summary}
				</summary>
				<div className="space-y-2 px-3 pb-3">
					{call.arguments ? (
						<div className="space-y-1">
							<p className="text-xs text-muted-foreground">Arguments</p>
							<OutputBlock label="Arguments" value={call.arguments} />
						</div>
					) : null}
					{call.responseBody ? (
						<div className="space-y-1">
							<p className="text-xs text-muted-foreground">Response</p>
							<OutputBlock label="Response" value={call.responseBody} />
						</div>
					) : null}
				</div>
			</details>
		</li>
	);
}

function SourceList({ sources }: { sources: string[] }) {
	return (
		<div className="space-y-1.5">
			<p className="text-xs font-medium text-muted-foreground">
				Sources <span className="tabular-nums">({sources.length})</span>
			</p>
			<ol className="space-y-1">
				{sources.map((url, index) => (
					<li key={url} className="flex min-w-0 items-center gap-2 text-sm">
						<span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
							{index + 1}.
						</span>
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer nofollow"
							className="inline-flex min-w-0 items-center gap-1 rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
							title={url}
						>
							<span className="truncate">{hostLabel(url)}</span>
							<ExternalLinkIcon
								className="size-3 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span className="sr-only">(opens in a new tab)</span>
						</a>
					</li>
				))}
			</ol>
		</div>
	);
}

function MemoryWritesNote({ writes }: { writes: MemoryWrites }) {
	const set = writes.set ?? [];
	const deleted = writes.deleted ?? [];
	const dropped = writes.dropped ?? [];
	if (set.length + deleted.length + dropped.length === 0) return null;
	return (
		<div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
			<p className="font-medium">Memory updated</p>
			<ul className="mt-1 space-y-0.5 text-muted-foreground">
				{set.length > 0 ? (
					<li>
						Saved <span className="font-mono">{set.join(", ")}</span>
					</li>
				) : null}
				{deleted.length > 0 ? (
					<li>
						Deleted <span className="font-mono">{deleted.join(", ")}</span>
					</li>
				) : null}
				{dropped.length > 0 ? (
					<li className="text-destructive">
						Not saved (memory full){" "}
						<span className="font-mono">{dropped.join(", ")}</span>
					</li>
				) : null}
			</ul>
		</div>
	);
}
