import { Bot, type LucideIcon, ShieldAlert } from "lucide-react";

export type AppNavRoute = {
	id: string;
	title: string;
	to: string;
	icon: LucideIcon;
	/** When true, only the exact path is considered active. */
	exact?: boolean;
};

export const appNavRoutes: AppNavRoute[] = [
	{ id: "agents", title: "Agents", to: "/agents", icon: Bot },
	{
		id: "security",
		title: "Security",
		to: "/security",
		icon: ShieldAlert,
		exact: true,
	},
];
