import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

// Spread onto the card's title <Link>: its ::after covers the whole card so the
// card is one click target. Other links and buttons are lifted above it.
export const cardLinkProps = {
	"data-card-link": "",
	className:
		"font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']",
} as const;

export function ResourceCard({
	tone = "default",
	className,
	children,
}: {
	tone?: "default" | "danger";
	className?: string;
	children: ReactNode;
}) {
	return (
		<article
			className={cn(
				"group/card relative flex h-full flex-col rounded-lg border bg-card text-card-foreground transition-[border-color,box-shadow] duration-150",
				"hover:border-foreground/20 hover:shadow-sm",
				"has-[[data-card-link]:focus-visible]:border-ring has-[[data-card-link]:focus-visible]:ring-[3px] has-[[data-card-link]:focus-visible]:ring-ring/50",
				"[&_a:not([data-card-link])]:relative [&_a:not([data-card-link])]:z-10 [&_button]:relative [&_button]:z-10",
				tone === "danger" &&
					"border-destructive/40 hover:border-destructive/60",
				className,
			)}
		>
			{children}
		</article>
	);
}

export function ResourceCardHeader({ children }: { children: ReactNode }) {
	return <div className="flex items-start gap-3 px-4 pt-4">{children}</div>;
}

export function ResourceCardIcon({ children }: { children: ReactNode }) {
	return (
		<span
			aria-hidden="true"
			className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground [&_svg]:size-4"
		>
			{children}
		</span>
	);
}

export function ResourceCardTitle({ children }: { children: ReactNode }) {
	return (
		<h3 className="min-w-0 flex-1 truncate text-sm leading-8">{children}</h3>
	);
}

// Secondary actions: revealed on hover or keyboard focus where the device can
// hover, always visible on touch screens.
export function ResourceCardActions({ children }: { children: ReactNode }) {
	return (
		<div className="-mt-0.5 -mr-2 flex shrink-0 items-center gap-0.5 transition-opacity duration-150 group-focus-within/card:opacity-100 group-hover/card:opacity-100 [@media(hover:hover)]:opacity-0">
			{children}
		</div>
	);
}

export function ResourceCardBody({ children }: { children: ReactNode }) {
	return (
		<div className="flex-1 space-y-3 px-4 pt-2 pb-4 text-sm">{children}</div>
	);
}

export function ResourceCardFooter({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-12 items-center justify-between gap-3 border-t px-4 py-2">
			{children}
		</div>
	);
}
