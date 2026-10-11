import { useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { RunWatcher } from "#/components/runs/run-watcher";
import { DashboardSidebar } from "#/components/sidebar/app-sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import type { User } from "#/lib/api/session";
import { useFadeUp } from "#/lib/motion";

export function AppShell({
	user,
	onLoggedOut,
	children,
}: {
	user: User;
	onLoggedOut: () => void;
	children: ReactNode;
}) {
	const pathname = useRouterState({
		select: (router) => router.location.pathname,
	});
	const fadeUp = useFadeUp();

	return (
		<SidebarProvider defaultOpen>
			<RunWatcher />
			<DashboardSidebar onLoggedOut={onLoggedOut} user={user} />
			<SidebarInset className="min-w-0 md:border">
				<div className="flex h-12 items-center border-b px-4 md:hidden">
					<SidebarTrigger />
				</div>
				<motion.div
					key={pathname}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
					className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10"
				>
					{children}
				</motion.div>
			</SidebarInset>
		</SidebarProvider>
	);
}
