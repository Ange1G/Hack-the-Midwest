import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";

export function LoadingState({ label }: { label: string }) {
	return (
		<output aria-live="polite" className="block space-y-3">
			<p className="text-sm text-muted-foreground">{label}</p>
			<Skeleton className="h-9 w-2/5" />
			<Skeleton className="h-9 w-full" />
			<Skeleton className="h-9 w-4/5" />
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
		<Alert variant="destructive">
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>
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
			</AlertDescription>
		</Alert>
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
		<div className="rounded-lg border border-dashed p-10 text-center">
			<h2 className="text-lg font-semibold">{title}</h2>
			{description ? (
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			) : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}
