import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

// Status and severity labels: meaning in a small palette dot; label text stays
// --foreground for contrast (see tone-badge.test.tsx and AGENTS WCAG notes).
const toneDotClass: Record<Tone, string> = {
	neutral: "bg-muted-foreground",
	info: "bg-info",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-destructive",
};

export function ToneBadge({
	tone,
	pulse = false,
	className,
	children,
}: {
	tone: Tone;
	pulse?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-background px-2 text-xs font-medium text-foreground",
				className,
			)}
		>
			<span
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					toneDotClass[tone],
					pulse && "motion-safe:animate-status-pulse",
				)}
				aria-hidden="true"
			/>
			<span className="truncate">{children}</span>
		</span>
	);
}
