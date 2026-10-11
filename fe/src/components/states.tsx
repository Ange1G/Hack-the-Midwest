import type { ReactNode } from "react";
import { Notice } from "#/components/notice";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";

export function LoadingState({ label }: { label: string }) {
	return (
		<output
			aria-live="polite"
			className="island-shell block space-y-3 rounded-xl p-4"
		>
			<p className="text-sm text-muted-foreground">{label}</p>
			<Skeleton className="h-9 w-2/5 bg-(--line)" />
			<Skeleton className="h-9 w-full bg-(--line)" />
			<Skeleton className="h-9 w-4/5 bg-(--line)" />
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
