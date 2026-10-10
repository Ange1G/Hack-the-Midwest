import { motion } from "framer-motion";
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
import { NavUser } from "./nav-user";
import { Logo } from "./logo";
import DashboardNavigation from "./nav-main";

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
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader
        className={cn(
          "flex md:pt-3.5",
          isCollapsed
            ? "flex-row items-center justify-between gap-y-4 md:flex-col md:items-start md:justify-start"
            : "flex-row items-center justify-between",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Logo className="size-8 shrink-0" />
          {!isCollapsed && (
            <span className="truncate font-semibold text-foreground">
              {APP_BRANDING.productName}
            </span>
          )}
        </div>

        <motion.div
          animate={{ opacity: 1 }}
          className={cn(
            "flex items-center gap-2",
            isCollapsed ? "flex-row md:flex-col-reverse" : "flex-row",
          )}
          initial={{ opacity: 0 }}
          key={isCollapsed ? "header-collapsed" : "header-expanded"}
          transition={{ duration: 0.8 }}
        >
          <SidebarTrigger />
        </motion.div>
      </SidebarHeader>
      <SidebarContent className="gap-4 px-2 py-4">
        <DashboardNavigation routes={appNavRoutes} />
      </SidebarContent>
      <SidebarFooter className="px-2">
        <NavUser onLoggedOut={onLoggedOut} session={session} />
      </SidebarFooter>
    </Sidebar>
  );
}
