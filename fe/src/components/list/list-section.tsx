import { type ReactNode, useId } from "react";

// A lightly titled group on a list page: card sections and the full table.
export function ListSection({
	title,
	count,
	description,
	action,
	children,
}: {
	title: string;
	count?: number;
	description?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
}) {
	const headingId = useId();
	return (
		<section aria-labelledby={headingId} className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h2 id={headingId} className="text-sm font-medium">
							{title}
						</h2>
						{count != null ? (
							<span className="rounded-full bg-muted px-1.5 py-px text-xs text-muted-foreground tabular-nums">
								{count}
							</span>
						) : null}
					</div>
					{description ? (
						<p className="mt-0.5 text-xs text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children}
		</section>
	);
}
