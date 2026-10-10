import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

// Text stays in --foreground on a light tint of a :root palette colour, so a
// label is always above the WCAG AA 4.5:1 contrast ratio while the border and
// tint still carry the meaning. White-on-colour badges with this palette fall
// below the ratio (secondary teal 2.5:1, destructive 3.4:1).
export const toneClasses: Record<Tone, string> = {
	neutral: "border-border bg-transparent text-foreground",
	info: "border-(--lagoon-deep) bg-(--lagoon)/15 text-foreground",
	success: "border-(--palm) bg-(--palm)/12 text-foreground",
	warning: "border-(--accent) bg-(--accent)/30 text-foreground",
	danger: "border-(--destructive) bg-(--destructive)/12 text-foreground",
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
		<Badge variant="outline" className={cn(toneClasses[tone], className)}>
			{children}
		</Badge>
	);
}
