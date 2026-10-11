import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { notify } from "#/lib/feedback";
import { cn } from "#/lib/utils";

const COPIED_RESET_MS = 1500;

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
	const [copied, setCopied] = useState(false);
	const timer = useRef<number>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			window.clearTimeout(timer.current);
			timer.current = window.setTimeout(
				() => setCopied(false),
				COPIED_RESET_MS,
			);
		} catch (error) {
			notify.error("Could not copy to the clipboard", error);
		}
	};

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
				className="absolute top-2 right-2 bg-background/80 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover/output:opacity-100 hover:text-foreground focus-visible:opacity-100"
				onClick={() => void copy()}
			>
				{copied ? <CheckIcon /> : <CopyIcon />}
			</Button>
		</div>
	);
}
