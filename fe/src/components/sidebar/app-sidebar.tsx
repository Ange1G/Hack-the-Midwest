import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarTrigger,
	useSidebar,
} from "#/components/ui/sidebar";
import { appNavRoutes } from "#/config/app-navigation";
import {
	APP_BRANDING,
	resolveDeveloperContext,
} from "#/config/developer-contexts";
import type { User } from "#/lib/api/session";
import { cn } from "#/lib/utils";
import { Logo } from "./logo";
import DashboardNavigation from "./nav-main";
import { NavUser } from "./nav-user";

export function DashboardSidebar({
	user,
	onLoggedOut,
}: {
	user: User;
	onLoggedOut: () => void;
}) {
	const { state } = useSidebar();
	const isCollapsed = state === "collapsed";
	const session = resolveDeveloperContext(user);

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader
				className={cn(
					"flex h-12 flex-row items-center gap-2 px-2",
					isCollapsed ? "justify-center" : "justify-between",
				)}
			>
				{!isCollapsed && (
					<div className="flex min-w-0 items-center gap-2">
						<Logo className="size-5 shrink-0" aria-hidden="true" />
						<span className="truncate text-sm font-semibold tracking-tight">
							{APP_BRANDING.productName}
						</span>
					</div>
				)}
				<SidebarTrigger className="text-muted-foreground hover:text-foreground" />
			</SidebarHeader>
			<SidebarContent className="gap-4 px-2 py-2">
				<DashboardNavigation routes={appNavRoutes} />
			</SidebarContent>
			<SidebarFooter className="px-2">
				<NavUser onLoggedOut={onLoggedOut} session={session} />
			</SidebarFooter>
		</Sidebar>
	);
}
