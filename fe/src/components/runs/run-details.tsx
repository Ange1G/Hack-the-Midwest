import { AnimatePresence, motion } from "framer-motion";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "#/components/notice";
import { RelativeTime } from "#/components/relative-time";
import { StatusBadge } from "#/components/status-badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
import { isActiveRunStatus } from "#/lib/api/queries";
import type { Run } from "#/lib/api/schemas";
import { formatDateTime, formatDuration } from "#/lib/format";
import { transitionFast, useFadeUp } from "#/lib/motion";
import { cn } from "#/lib/utils";
import { OutputBlock } from "./output-block";

// Everything about one agent run: status, failure, input, output, tool calls,
// and timing. Shared by the agent page's run panel and the /runs/$runId page.
export function RunDetails({
	run,
	actions,
}: {
	run: Run;
	actions?: ReactNode;
}) {
	const live = isActiveRunStatus(run.status);
	const output = run.result?.output;
	const toolCalls = run.result?.tool_calls ?? [];
	const fadeUp = useFadeUp();

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={run.status}
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
							transition={transitionFast}
						>
							<StatusBadge status={run.status} />
						</motion.span>
					</AnimatePresence>
					<RelativeTime iso={run.started_at ?? run.created_at} />
					{formatDuration(run.started_at, run.finished_at) ? (
						<span className="tabular-nums">
							{formatDuration(run.started_at, run.finished_at)}
						</span>
					) : null}
				</div>
				{actions}
			</div>

			{run.status === "failed" && run.error_message ? (
				<Notice tone="danger" title="Run failed">
					<p>{run.error_message}</p>
					{run.error_code ? (
						<p>
							<code>{run.error_code}</code>
						</p>
					) : null}
				</Notice>
			) : null}

			{run.status === "timed_out" ? (
				<Notice tone="danger" title="Run timed out">
					<p>{run.error_message ?? "Execution timed out"}</p>
				</Notice>
			) : null}

			<RunBlock label="Output">
				<AnimatePresence mode="wait" initial={false}>
					{output ? (
						<motion.div
							key="output"
							variants={fadeUp}
							initial="hidden"
							animate="visible"
						>
							<OutputBlock label="Output" value={output} />
						</motion.div>
					) : live ? (
						<motion.p
							key="waiting"
							variants={fadeUp}
							initial="hidden"
							animate="visible"
							exit="exit"
							className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground"
						>
							<Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
							Waiting for the agent to finish…
						</motion.p>
					) : (
						<p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
							No output.
						</p>
					)}
				</AnimatePresence>
			</RunBlock>

			{run.input ? (
				<RunBlock label="Run input">
					<OutputBlock label="Run input" value={run.input} />
				</RunBlock>
			) : null}

			<ToolCalls toolCalls={toolCalls} live={live} />

			<Timeline run={run} />
		</div>
	);
}

function RunBlock({ label, children }: { label: string; children: ReactNode }) {
	return (
		<section className="space-y-2">
			<h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
			{children}
		</section>
	);
}

function ToolCalls({
	toolCalls,
	live,
}: {
	toolCalls: unknown[];
	live: boolean;
}) {
	const [open, setOpen] = useState(false);
	if (toolCalls.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				{live
					? "Waiting for the first tool call…"
					: "No tool calls were recorded."}
			</p>
		);
	}
	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="group/trigger flex cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
				<ChevronRightIcon
					className={cn(
						"size-3.5 transition-transform duration-150",
						open && "rotate-90",
					)}
					aria-hidden="true"
				/>
				Tool calls
				<span className="tabular-nums">({toolCalls.length})</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-2">
				<OutputBlock
					label="Tool calls"
					value={JSON.stringify(toolCalls, null, 2)}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}

function Timeline({ run }: { run: Run }) {
	const steps = [
		{ label: "Queued", at: run.created_at },
		{ label: "Started", at: run.started_at },
		{ label: "Finished", at: run.finished_at },
	];
	return (
		<ol className="grid grid-cols-3 gap-2 border-t pt-4 text-xs">
			{steps.map((step) => (
				<li key={step.label} className="flex min-w-0 flex-col gap-1">
					<span className="flex items-center gap-1.5 font-medium">
						<span
							className={cn(
								"size-1.5 rounded-full",
								step.at ? "bg-foreground" : "bg-border",
							)}
							aria-hidden="true"
						/>
						{step.label}
					</span>
					<span className="truncate text-muted-foreground">
						{step.at ? formatDateTime(step.at) : "—"}
					</span>
				</li>
			))}
		</ol>
	);
}
