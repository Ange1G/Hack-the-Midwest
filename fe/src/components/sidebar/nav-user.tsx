import { ChevronsUpDown, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "#/components/ui/sidebar";
import type { SessionDisplayContext } from "#/config/developer-contexts";
import { useSignOut } from "#/lib/api/queries";
import { notify } from "#/lib/feedback";
import { cn } from "#/lib/utils";

export function NavUser({
	session,
	onLoggedOut,
}: {
	session: SessionDisplayContext;
	onLoggedOut: () => void;
}) {
	const { isMobile, state } = useSidebar();
	const isCollapsed = state === "collapsed";
	const logout = useSignOut();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							aria-label={`Account menu for ${session.email}`}
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							size="lg"
						>
							<Avatar className="size-8 rounded-lg">
								{session.avatarUrl ? (
									<AvatarImage alt="" src={session.avatarUrl} />
								) : null}
								<AvatarFallback className="rounded-lg text-foreground">
									{session.initials}
								</AvatarFallback>
							</Avatar>
							{!isCollapsed && (
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">
										{session.displayName}
									</span>
									<span className="truncate text-sidebar-foreground/70 text-xs">
										{session.email}
									</span>
								</div>
							)}
							{!isCollapsed && (
								<ChevronsUpDown aria-hidden="true" className="ml-auto size-4" />
							)}
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className={cn("min-w-56 rounded-lg", isMobile ? "mb-2" : "mb-4")}
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex flex-col gap-0.5 px-2 py-1.5 text-left text-sm">
								<span className="font-medium">{session.displayName}</span>
								<span className="text-muted-foreground text-xs">
									{session.email}
								</span>
								{session.authProviderLabel ? (
									<span className="text-muted-foreground text-xs">
										{session.authProviderLabel}
									</span>
								) : null}
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={logout.isPending}
							onClick={() =>
								logout.mutate(undefined, {
									onSuccess: () => {
										notify.success("Signed out");
										onLoggedOut();
									},
									onError: (error) => notify.error("Could not sign out", error),
								})
							}
						>
							<LogOut aria-hidden="true" className="mr-2 size-4 opacity-80" />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
