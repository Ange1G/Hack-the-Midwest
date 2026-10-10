import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

// Status and severity labels: meaning in a small palette dot; label text stays
// --foreground for contrast (see tone-badge.test.tsx and AGENTS WCAG notes).
const toneDotClass: Record<Tone, string> = {
	neutral: "bg-muted-foreground",
	info: "bg-(--lagoon-deep)",
	success: "bg-(--palm)",
	warning: "bg-(--kicker)",
	danger: "bg-(--destructive)",
};

export function ToneBadge({
	tone,
	className,
	children,
}: {
	tone: Tone;
	className?: string;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex max-w-full min-w-0 items-center gap-2 text-sm font-medium text-foreground",
				className,
			)}
		>
			<span
				className={cn("size-2 shrink-0 rounded-full", toneDotClass[tone])}
				aria-hidden="true"
			/>
			<span className="truncate">{children}</span>
		</span>
	);
}
