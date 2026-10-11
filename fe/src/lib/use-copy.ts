import { useEffect, useRef, useState } from "react";
import { notify } from "#/lib/feedback";

const COPIED_RESET_MS = 1500;

// Clipboard write with a short-lived "copied" flag for icon feedback.
export function useCopy() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);

	const copy = async (value: string) => {
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

	return { copied, copy };
}
