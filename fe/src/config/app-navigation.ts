import { Bot, type LucideIcon } from "lucide-react";

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
];
