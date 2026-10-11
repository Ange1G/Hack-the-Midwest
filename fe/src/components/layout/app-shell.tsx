import type { ReactNode } from "react";
import { DashboardSidebar } from "#/components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import type { User } from "#/lib/api/session";

export function AppShell({
  user,
  onLoggedOut,
  children,
}: {
  user: User;
  onLoggedOut: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar onLoggedOut={onLoggedOut} user={user} />
        <SidebarInset className="min-w-0 flex-1 bg-transparent p-8">
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
