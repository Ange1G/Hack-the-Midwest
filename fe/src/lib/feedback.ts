import { type ExternalToast, toast } from "sonner";

type NotifyOptions = Pick<
	ExternalToast,
	"description" | "action" | "id" | "duration"
>;

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message
		? error.message
		: "Something unexpected happened.";
}

// Transient confirmations for user actions. Every message here is either
// static copy or an API error message that the UI already shows inline, so no
// credential or secret ever reaches a toast.
export const notify = {
	success(title: string, options?: NotifyOptions) {
		return toast.success(title, options);
	},
	info(title: string, options?: NotifyOptions) {
		return toast.info(title, options);
	},
	error(title: string, error?: unknown, options?: NotifyOptions) {
		return toast.error(title, {
			description: error === undefined ? undefined : errorMessage(error),
			...options,
		});
	},
};
