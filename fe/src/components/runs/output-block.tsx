import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { useCopy } from "#/lib/use-copy";
import { cn } from "#/lib/utils";

// Monospace block for agent output, inputs, and JSON, with a copy control.
export function OutputBlock({
	label,
	value,
	className,
}: {
	label: string;
	value: string;
	className?: string;
}) {
	const { copied, copy } = useCopy();

	return (
		<div className={cn("group/output relative", className)}>
			<pre className="max-h-[28rem] overflow-auto rounded-md border bg-muted/40 p-3 pr-10 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words">
				{value}
			</pre>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
				className="absolute top-2 right-2 bg-background/80 text-muted-foreground backdrop-blur-sm transition-opacity group-hover/output:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
				onClick={() => void copy(value)}
			>
				{copied ? <CheckIcon /> : <CopyIcon />}
			</Button>
		</div>
	);
}
