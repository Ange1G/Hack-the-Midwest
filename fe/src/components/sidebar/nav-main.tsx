import { Link, useRouterState } from "@tanstack/react-router";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar";
import type { AppNavRoute } from "#/config/app-navigation";
import { cn } from "#/lib/utils";

function isRouteActive(pathname: string, route: AppNavRoute): boolean {
	return route.exact
		? pathname === route.to
		: pathname === route.to || pathname.startsWith(`${route.to}/`);
}

export default function DashboardNavigation({
	routes,
}: {
	routes: AppNavRoute[];
}) {
	const { state } = useSidebar();
	const pathname = useRouterState({
		select: (router) => router.location.pathname,
	});
	const isCollapsed = state === "collapsed";

	return (
		<nav aria-label="Main">
			<SidebarMenu>
				{routes.map((route) => {
					const Icon = route.icon;
					const isActive = isRouteActive(pathname, route);

					return (
						<SidebarMenuItem key={route.id}>
							<SidebarMenuButton asChild tooltip={route.title}>
								<Link
									to={route.to}
									data-active={isActive ? "true" : undefined}
									className={cn(
										"flex items-center rounded-lg px-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
										isActive &&
											"bg-sidebar-accent font-medium text-sidebar-accent-foreground",
										isCollapsed && "justify-center",
									)}
								>
									<Icon aria-hidden="true" className="size-4" />
									{!isCollapsed && (
										<span className="ml-2 text-sm">{route.title}</span>
									)}
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					);
				})}
			</SidebarMenu>
		</nav>
	);
}
