import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";
import type * as React from "react";

const ToastProvider = ToastPrimitive.Provider;

function ToastViewport({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
	return (
		<ToastPrimitive.Viewport
			data-slot="toast-viewport"
			className={cn(
				"fixed right-0 bottom-0 z-100 flex w-full max-w-[420px] flex-col gap-2 p-4 outline-none",
				className,
			)}
			{...props}
		/>
	);
}

// Tone lives in the border; text stays in the popover foreground for contrast.
const toastVariants = cva(
	"group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border bg-popover p-4 pr-9 text-popover-foreground shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[swipe=end]:animate-out",
	{
		variants: {
			tone: {
				info: "border-(--lagoon-deep)",
				success: "border-(--palm)",
				danger: "border-(--destructive)",
			},
		},
		defaultVariants: { tone: "info" },
	},
);

function Toast({
	className,
	tone,
	...props
}: React.ComponentProps<typeof ToastPrimitive.Root> &
	VariantProps<typeof toastVariants>) {
	return (
		<ToastPrimitive.Root
			data-slot="toast"
			type="background"
			className={cn(toastVariants({ tone }), className)}
			{...props}
		/>
	);
}

function ToastTitle({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitive.Title>) {
	return (
		<ToastPrimitive.Title
			data-slot="toast-title"
			className={cn("text-sm font-semibold", className)}
			{...props}
		/>
	);
}

function ToastDescription({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitive.Description>) {
	return (
		<ToastPrimitive.Description
			data-slot="toast-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function ToastAction({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitive.Action>) {
	return (
		<ToastPrimitive.Action
			data-slot="toast-action"
			className={cn(
				"inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 font-medium text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
			{...props}
		/>
	);
}

function ToastClose({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitive.Close>) {
	return (
		<ToastPrimitive.Close
			data-slot="toast-close"
			aria-label="Dismiss"
			className={cn(
				"absolute top-2 right-2 rounded-md p-1 text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
			{...props}
		>
			<XIcon className="size-4" aria-hidden="true" />
		</ToastPrimitive.Close>
	);
}

export {
	ToastProvider,
	ToastViewport,
	Toast,
	ToastTitle,
	ToastDescription,
	ToastAction,
	ToastClose,
};
