import type { ReactNode } from "react";
<<<<<<< HEAD
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { useSignOut } from "#/lib/api/queries";
import type { User } from "#/lib/api/session";
=======
import { DashboardSidebar } from "#/components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import type { User } from "#/lib/api/schemas";
>>>>>>> 9e7bb1f (refactor: fix layout styling)

export function AppShell({
  user,
  onLoggedOut,
  children,
}: {
  user: User;
  onLoggedOut: () => void;
  children: ReactNode;
}) {
<<<<<<< HEAD
	const logout = useSignOut();

	return (
		<div className="flex min-h-screen">
			<aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
				<div className="px-5 py-5">
					<p className="island-kicker">Hack Midwest 2026</p>
					<p className="display-title text-xl font-semibold">Agent Platform</p>
				</div>
				<Separator />
				<nav aria-label="Main" className="flex flex-col gap-1 p-3">
					{navItems.map(({ to, label, icon: Icon }) => (
						<Link
							key={to}
							to={to}
							className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent/30"
							activeProps={{
								className: "bg-sidebar-accent/40 text-sidebar-foreground",
							}}
						>
							<Icon className="size-4" aria-hidden="true" />
							{label}
						</Link>
					))}
				</nav>
				<div className="mt-auto space-y-2 p-4">
					<Separator />
					<p
						className="truncate pt-2 text-sm text-muted-foreground"
						title={user.user_sso}
					>
						{user.user_sso}
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full"
						disabled={logout.isPending}
						onClick={() => logout.mutate(undefined, { onSuccess: onLoggedOut })}
					>
						Sign out
					</Button>
				</div>
			</aside>
			<main className="min-w-0 flex-1 p-8">{children}</main>
		</div>
	);
=======
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
>>>>>>> 9e7bb1f (refactor: fix layout styling)
}
