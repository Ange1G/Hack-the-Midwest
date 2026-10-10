import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { seedDemoState } from "./seed";

export async function startMockWorker(): Promise<void> {
	seedDemoState();
	const worker = setupWorker(...handlers);
	await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}
