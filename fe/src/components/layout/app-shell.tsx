import type { ReactNode } from "react";
import { DashboardSidebar } from "#/components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import type { User } from "#/lib/api/identity";

export function AppShell({
	user,
	children,
}: {
	user: User;
	children: ReactNode;
}) {
	return (
		<SidebarProvider defaultOpen>
			<div className="flex min-h-screen w-full">
				<DashboardSidebar user={user} />
				<SidebarInset className="page-view min-w-0 flex-1 bg-transparent p-8">
					{children}
				</SidebarInset>
			</div>
		</SidebarProvider>
	);
}
