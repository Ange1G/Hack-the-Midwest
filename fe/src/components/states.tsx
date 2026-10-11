import type { ReactNode } from "react";
import { Notice } from "#/components/notice";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export type LoadingLayout = "panel" | "table" | "detail" | "run" | "form";

// A placeholder bar; the highlight sweep lives in styles.css (.skeleton-bar).
function Bar({ className }: { className?: string }) {
	return (
		<div
			data-slot="skeleton"
			className={cn("skeleton-bar h-4 rounded-md", className)}
		/>
	);
}

const TABLE_ROWS = ["first", "second", "third", "fourth"];
const LINE_WIDTHS = ["w-full", "w-3/5", "w-4/5", "w-2/5"];
const FORM_FIELDS = ["name", "instructions", "calls"];

// Sketches follow the real screens so content lands where the placeholders were.

function TableSketch() {
	return (
		<div className="table-panel overflow-hidden rounded-xl">
			<div className="flex items-center gap-6 border-(--line) border-b px-4 py-3">
				<Bar className="h-3 w-16" />
				<Bar className="h-3 w-20" />
				<Bar className="h-3 w-16" />
				<Bar className="h-3 w-16" />
				<Bar className="ml-auto h-3 w-14" />
			</div>
			{TABLE_ROWS.map((row) => (
				<div
					key={row}
					data-skeleton-row
					className="flex items-center gap-6 border-(--line) border-b px-4 py-4 last:border-b-0"
				>
					<Bar className="w-36" />
					<Bar className="h-6 w-28" />
					<Bar className="w-24" />
					<Bar className="w-32" />
					<div className="ml-auto flex gap-2">
						<Bar className="size-8" />
						<Bar className="size-8" />
						<Bar className="size-8" />
					</div>
				</div>
			))}
		</div>
	);
}

function HeaderSketch({ action = true }: { action?: boolean }) {
	return (
		<div className="mb-6 flex items-start justify-between gap-4">
			<div className="space-y-2">
				<Bar className="h-9 w-64" />
				<Bar className="w-40" />
			</div>
			{action ? <Bar className="h-9 w-28" /> : null}
		</div>
	);
}

function CardSketch({
	lines,
	className,
}: {
	lines: number;
	className?: string;
}) {
	return (
		<div className={cn("island-shell space-y-3 rounded-xl p-6", className)}>
			<Bar className="mb-4 h-5 w-32" />
			{LINE_WIDTHS.slice(0, lines).map((width) => (
				<Bar key={width} className={width} />
			))}
		</div>
	);
}

function DetailSketch() {
	return (
		<>
			<HeaderSketch />
			<Bar className="mb-4 h-9 w-40 rounded-lg" />
			<div className="space-y-6">
				<CardSketch lines={1} />
				<CardSketch lines={3} />
				<CardSketch lines={3} />
			</div>
		</>
	);
}

function RunSketch() {
	return (
		<>
			<HeaderSketch />
			<div className="flex flex-wrap gap-6">
				<Bar className="w-32" />
				<Bar className="w-36" />
				<Bar className="w-36" />
			</div>
			<div className="mt-6 grid gap-6 lg:grid-cols-2">
				<CardSketch lines={3} />
				<CardSketch lines={4} />
			</div>
		</>
	);
}

function FormSketch() {
	return (
		<>
			<HeaderSketch action={false} />
			<div className="island-shell space-y-5 rounded-xl p-6">
				{FORM_FIELDS.map((field) => (
					<div key={field} className="space-y-2">
						<Bar className="h-3 w-24" />
						<Bar className={field === "instructions" ? "h-24" : "h-9"} />
					</div>
				))}
				<Bar className="h-9 w-32" />
			</div>
		</>
	);
}

function PanelSketch() {
	return (
		<div className="island-shell space-y-3 rounded-xl p-4">
			<Bar className="h-9 w-2/5" />
			<Bar className="h-9 w-full" />
			<Bar className="h-9 w-4/5" />
		</div>
	);
}

const sketches: Record<LoadingLayout, ReactNode> = {
	panel: <PanelSketch />,
	table: <TableSketch />,
	detail: <DetailSketch />,
	run: <RunSketch />,
	form: <FormSketch />,
};

export function LoadingState({
	label,
	layout = "panel",
}: {
	label: string;
	layout?: LoadingLayout;
}) {
	return (
		<output aria-live="polite" data-layout={layout} className="block">
			<span className="sr-only">{label}</span>
			{sketches[layout]}
		</output>
	);
}

export function ErrorState({
	title,
	error,
	onRetry,
}: {
	title: string;
	error: unknown;
	onRetry?: () => void;
}) {
	const message =
		error instanceof Error ? error.message : "Something unexpected happened.";
	return (
		<Notice tone="danger" title={title}>
			<p>{message}</p>
			{onRetry ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="mt-2"
					onClick={onRetry}
				>
					Try again
				</Button>
			) : null}
		</Notice>
	);
}

export function EmptyState({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="island-shell rounded-xl border-dashed p-10 text-center">
			<h2 className="text-lg font-semibold">{title}</h2>
			{description ? (
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			) : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}
