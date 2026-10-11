import { type ReactNode, useId } from "react";
import { cn } from "#/lib/utils";

export function PageHeader({
	title,
	description,
	eyebrow,
	meta,
	action,
}: {
	title: string;
	description?: ReactNode;
	eyebrow?: ReactNode;
	meta?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-6">
			<div className="min-w-0 space-y-1.5">
				{eyebrow ? (
					<div className="text-sm text-muted-foreground">{eyebrow}</div>
				) : null}
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="truncate text-2xl font-semibold tracking-tight">
						{title}
					</h1>
					{meta}
				</div>
				{description ? (
					<p className="max-w-2xl text-sm text-muted-foreground">
						{description}
					</p>
				) : null}
			</div>
			{action ? (
				<div className="flex shrink-0 items-center gap-2">{action}</div>
			) : null}
		</header>
	);
}

// A titled, bordered panel: the building block for detail pages.
export function Section({
	title,
	description,
	action,
	className,
	contentClassName,
	children,
}: {
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
	contentClassName?: string;
	children: ReactNode;
}) {
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			className={cn("rounded-lg border bg-card", className)}
		>
			<header className="flex items-center justify-between gap-4 border-b px-4 py-3">
				<div className="min-w-0">
					<h2 id={headingId} className="text-sm font-medium">
						{title}
					</h2>
					{description ? (
						<p className="mt-0.5 text-xs text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</header>
			<div className={cn("p-4", contentClassName)}>{children}</div>
		</section>
	);
}
