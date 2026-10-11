import type { ReactNode } from "react";
import { Notice } from "#/components/notice";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";

export function LoadingState({ label }: { label: string }) {
	return (
		<output
			aria-live="polite"
			className="block overflow-hidden rounded-lg border bg-card"
		>
			<span className="sr-only">{label}</span>
			<div className="flex items-center gap-3 border-b px-4 py-3">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="ml-auto h-4 w-16" />
			</div>
			{[0, 1, 2].map((row) => (
				<div
					key={row}
					className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0"
				>
					<Skeleton className="h-4 w-1/4" />
					<Skeleton className="h-4 w-1/5" />
					<Skeleton className="ml-auto h-4 w-20" />
				</div>
			))}
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
	icon,
	action,
}: {
	title: string;
	description?: string;
	icon?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
			{icon ? (
				<div
					className="mb-4 flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground [&_svg]:size-4"
					aria-hidden="true"
				>
					{icon}
				</div>
			) : null}
			<h2 className="text-sm font-medium">{title}</h2>
			{description ? (
				<p className="mt-1 max-w-sm text-sm text-muted-foreground">
					{description}
				</p>
			) : null}
			{action ? <div className="mt-5">{action}</div> : null}
		</div>
	);
}
