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
  if (route.exact) {
    return pathname === route.to;
  }
  return pathname === route.to || pathname.startsWith(`${route.to}/`);
}

export function DashboardNavigation({ routes }: { routes: AppNavRoute[] }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Main">
      <SidebarMenu>
        {routes.map((route) => {
          const Icon = route.icon;
          const isActive = isRouteActive(pathname, route);
          return (
            <SidebarMenuItem key={route.id}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                tooltip={route.title}
              >
                <Link
                  to={route.to}
                  data-active={isActive ? "true" : undefined}
                  className={cn(
                    "flex items-center text-sidebar-foreground/80 transition-colors",
                    isActive &&
                      "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    !isActive &&
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
