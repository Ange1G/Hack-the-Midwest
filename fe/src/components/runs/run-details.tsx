import { AnimatePresence, motion } from "framer-motion";
import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "#/components/notice";
import { RelativeTime } from "#/components/relative-time";
import { StatusBadge } from "#/components/status-badge";
import { isActiveRunStatus } from "#/lib/api/queries";
import { OUTPUT_SCHEMA_ERROR_CODES, type Run } from "#/lib/api/schemas";
import { formatDateTime, formatDuration } from "#/lib/format";
import { transitionFast, useFadeUp } from "#/lib/motion";
import { cn } from "#/lib/utils";
import { OutputBlock } from "./output-block";
import { ToolCallList } from "./tool-call-list";

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
	const hasParsed = run.result != null && "parsed" in run.result;
	const schemaFailure = OUTPUT_SCHEMA_ERROR_CODES.has(run.error_code ?? "");
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
				<Notice
					tone="danger"
					title={
						schemaFailure ? "Output did not match the schema" : "Run failed"
					}
				>
					<p className={cn(schemaFailure && "whitespace-pre-wrap")}>
						{run.error_message}
					</p>
					{schemaFailure && output ? (
						<p>The agent's raw reply is shown under Output.</p>
					) : null}
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

			{hasParsed ? (
				<RunBlock label="Structured output">
					<OutputBlock
						label="Structured output"
						value={JSON.stringify(run.result?.parsed, null, 2)}
					/>
				</RunBlock>
			) : null}

			{run.input ? (
				<RunBlock label="Run input">
					<OutputBlock label="Run input" value={run.input} />
				</RunBlock>
			) : null}

			<ToolCallList
				toolCalls={toolCalls}
				output={output}
				live={live}
				memoryWrites={run.result?.memory_writes}
			/>

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
