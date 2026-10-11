import { Notice } from "#/components/notice";
import { Button } from "#/components/ui/button";
import { API_BASE_URL, ApiError } from "#/lib/api/client";

// Shown when the authenticated area cannot be entered at all, usually because
// the API is not running. Anything that is not a connection problem is
// surfaced verbatim so it is never swallowed.
export function ApiUnavailable({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	const unreachable = error instanceof ApiError && error.status === 0;
	const message =
		error instanceof Error ? error.message : "Something unexpected happened.";

	return (
		<main className="flex min-h-screen items-center justify-center p-6">
			<Notice
				tone="danger"
				className="max-w-lg"
				title={
					unreachable ? "Could not reach the API" : "Could not load the app"
				}
			>
				<p>{message}</p>
				{unreachable ? (
					<p>
						The frontend expects the API at <code>{API_BASE_URL}</code>. Start
						the backend, set <code>VITE_API_URL</code>, or run{" "}
						<code>npm run dev:mock</code> to work against the mock API.
					</p>
				) : null}
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="mt-2"
					onClick={onRetry}
				>
					Try again
				</Button>
			</Notice>
		</main>
	);
}
