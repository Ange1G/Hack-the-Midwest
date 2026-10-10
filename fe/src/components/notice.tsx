import type { ReactNode } from "react";
import { cn } from "#/lib/utils";
import type { Tone } from "./tone-badge";

const toneClasses: Record<Tone, string> = {
	neutral: "border-border bg-card",
	info: "border-(--lagoon-deep) bg-(--lagoon)/10",
	success: "border-(--palm) bg-(--palm)/10",
	warning: "border-(--accent) bg-(--accent)/20",
	danger: "border-(--destructive) bg-(--destructive)/10",
};

// An inline message with role="alert". Text stays in --foreground for
// contrast; the tone is carried by the border and a light tint of a :root
// palette colour.
export function Notice({
	tone,
	title,
	className,
	children,
}: {
	tone: Tone;
	title: ReactNode;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			role="alert"
			className={cn(
				"rounded-lg border px-4 py-3 text-sm text-foreground",
				toneClasses[tone],
				className,
			)}
		>
			<p className="font-semibold">{title}</p>
			{children ? <div className="mt-1 space-y-1">{children}</div> : null}
		</div>
	);
}
