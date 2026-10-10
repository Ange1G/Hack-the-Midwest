import type { HttpMethod } from "#/lib/api/schemas";
import { cn } from "#/lib/utils";

// Both segments keep dark text: --lagoon-deep on --foam is 3.6:1 at this size,
// below WCAG AA, so POST is distinguished by its background instead.
const methodAccent: Record<HttpMethod, string> = {
	GET: "text-(--sea-ink-soft) bg-(--sand)",
	POST: "text-(--sea-ink) bg-(--foam)",
};

export function HttpCallChip({
	method,
	name,
}: {
	method: HttpMethod;
	name: string;
}) {
	return (
		<span
			className="inline-flex max-w-full min-w-0 items-stretch overflow-hidden rounded-md border border-(--line) font-mono text-xs leading-none"
			title={`${method} ${name}`}
		>
			<span
				className={cn(
					"shrink-0 border-r border-(--line) px-1.5 py-1.5 font-medium tracking-wide",
					methodAccent[method],
				)}
				aria-hidden="true"
			>
				{method}
			</span>
			<span className="min-w-0 truncate px-2 py-1.5 text-(--sea-ink)">
				{name}
			</span>
			<span className="sr-only">{`${method} call ${name}`}</span>
		</span>
	);
}
