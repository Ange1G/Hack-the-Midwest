import type { HttpMethod } from "#/lib/api/schemas";
import { cn } from "#/lib/utils";

const methodAccent: Record<HttpMethod, string> = {
	GET: "text-(--sea-ink-soft) bg-(--sand)",
	POST: "text-(--lagoon-deep) bg-(--foam)",
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
