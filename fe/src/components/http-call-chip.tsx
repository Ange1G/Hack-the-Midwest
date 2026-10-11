import type { HttpMethod } from "#/lib/api/schemas";
import { cn } from "#/lib/utils";

// The method label stays on the foreground colour so it keeps its contrast
// whatever tint the palette gives the segment.
const methodAccent: Record<HttpMethod, string> = {
	GET: "bg-muted/60",
	POST: "bg-info/15",
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
			className="inline-flex max-w-full min-w-0 items-stretch overflow-hidden rounded-md border font-mono text-xs leading-none"
			title={`${method} ${name}`}
		>
			<span
				className={cn(
					"shrink-0 border-r px-1.5 py-1.5 font-medium tracking-wide text-foreground",
					methodAccent[method],
				)}
				aria-hidden="true"
			>
				{method}
			</span>
			<span className="min-w-0 truncate bg-background px-2 py-1.5 text-foreground">
				{name}
			</span>
			<span className="sr-only">{`${method} call ${name}`}</span>
		</span>
	);
}
