import {
	CircleAlertIcon,
	CircleCheckIcon,
	InfoIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "#/lib/utils";
import type { Tone } from "./tone-badge";

const toneClasses: Record<Tone, string> = {
	neutral: "border-border bg-card",
	info: "border-info/40 bg-info/5",
	success: "border-success/40 bg-success/5",
	warning: "border-warning/50 bg-warning/10",
	danger: "border-destructive/40 bg-destructive/5",
};

const toneIcon: Record<Tone, ReactNode> = {
	neutral: <InfoIcon className="size-4 text-muted-foreground" />,
	info: <InfoIcon className="size-4 text-info" />,
	success: <CircleCheckIcon className="size-4 text-success" />,
	warning: <TriangleAlertIcon className="size-4 text-warning" />,
	danger: <CircleAlertIcon className="size-4 text-destructive" />,
};

// An inline message with role="alert". Text stays in --foreground for
// contrast; the tone is carried by the icon, border, and a light tint.
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
				"flex gap-3 rounded-lg border px-4 py-3 text-sm text-foreground",
				toneClasses[tone],
				className,
			)}
		>
			<span className="mt-0.5 shrink-0" aria-hidden="true">
				{toneIcon[tone]}
			</span>
			<div className="min-w-0 flex-1">
				<p className="font-medium">{title}</p>
				{children ? (
					<div className="mt-1 space-y-1 text-muted-foreground [&_code]:text-foreground">
						{children}
					</div>
				) : null}
			</div>
		</div>
	);
}
