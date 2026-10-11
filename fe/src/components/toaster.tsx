import { ToneBadge } from "#/components/tone-badge";
import {
	Toast,
	ToastAction,
	ToastClose,
	ToastDescription,
	ToastProvider,
	ToastTitle,
	ToastViewport,
} from "#/components/ui/toast";
import { dismissToast, useToasts } from "#/lib/toast";

// Shows the notifications pushed through lib/toast.ts. Mounted once, in the
// app layout; Radix handles the live region, timers, swipe and the F8 hotkey.
export function Toaster() {
	const toasts = useToasts();

	return (
		<ToastProvider swipeDirection="right">
			{toasts.map((item) => (
				<Toast
					key={item.id}
					tone={item.tone}
					duration={item.durationMs}
					open={item.open}
					onOpenChange={(open) => {
						if (!open) dismissToast(item.id);
					}}
				>
					<div className="grid min-w-0 flex-1 gap-1">
						<ToastTitle>
							<ToneBadge tone={item.tone}>{item.title}</ToneBadge>
						</ToastTitle>
						{item.description ? (
							<ToastDescription>{item.description}</ToastDescription>
						) : null}
					</div>
					{item.action ? (
						<ToastAction
							altText={item.action.label}
							onClick={item.action.onSelect}
						>
							{item.action.label}
						</ToastAction>
					) : null}
					<ToastClose />
				</Toast>
			))}
			<ToastViewport />
		</ToastProvider>
	);
}
