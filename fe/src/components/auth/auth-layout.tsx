import type { ReactNode } from "react";
import { Logo } from "#/components/sidebar/logo";
import { APP_BRANDING } from "#/config/developer-contexts";

export function AuthLayout({
	title,
	description,
	children,
	footer,
}: {
	title: string;
	description: string;
	children: ReactNode;
	footer: ReactNode;
}) {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-6">
			<div className="w-full max-w-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
				<div className="mb-8 flex flex-col items-center text-center">
					<Logo className="mb-6 size-8" aria-hidden="true" />
					<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
					<p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
				</div>
				<div className="rounded-lg border bg-card p-6 shadow-xs">
					{children}
				</div>
				<div className="mt-6 text-center text-sm text-muted-foreground">
					{footer}
				</div>
				<p className="mt-10 text-center text-xs text-muted-foreground">
					{APP_BRANDING.productName}
				</p>
			</div>
		</main>
	);
}
