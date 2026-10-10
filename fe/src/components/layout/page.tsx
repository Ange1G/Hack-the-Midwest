import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<header className="mb-6 flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 className="display-title text-3xl font-semibold">{title}</h1>
				{description ? (
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				) : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</header>
	);
}
