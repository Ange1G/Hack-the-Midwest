import {
	Bot,
	GitBranch,
	type LucideIcon,
	Plug,
	ShieldAlert,
	Webhook,
} from "lucide-react";

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
	{ id: "connectors", title: "Connectors", to: "/connectors", icon: Plug },
	{ id: "chains", title: "Chains", to: "/chains", icon: GitBranch },
	{
		id: "webhooks",
		title: "Webhooks",
		to: "/webhooks",
		icon: Webhook,
		exact: true,
	},
	{
		id: "security",
		title: "Security",
		to: "/security",
		icon: ShieldAlert,
		exact: true,
	},
];
