import type { User } from "#/lib/api/session";

export const APP_BRANDING = {
	productName: "Stragents",
} as const;

export type AuthProvider = "password" | "google" | "github" | "sso";

export type SessionDisplayContext = {
	displayName: string;
	/** Shown in the shell; for SSO auth this is the user's SSO id. */
	email: string;
	avatarUrl?: string;
	authProvider: AuthProvider;
	authProviderLabel?: string;
	initials: string;
};

type DeveloperContextPreset = {
	displayName: string;
	avatarUrl?: string;
	authProvider: AuthProvider;
	authProviderLabel?: string;
};

/** UI-only session display keyed by SSO id (lowercase). Not a security boundary. */
export const DEVELOPER_CONTEXTS_BY_SSO: Record<string, DeveloperContextPreset> =
	{
		admin: {
			displayName: "Demo Admin",
			authProvider: "sso",
			authProviderLabel: "Development SSO",
		},
	};

function displayNameFromSso(user_sso: string): string {
	return user_sso
		.split(/[._-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function initialsFromDisplayName(
	displayName: string,
	user_sso: string,
): string {
	const parts = displayName.trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
	}
	return user_sso.slice(0, 2).toUpperCase();
}

export function resolveDeveloperContext(user: User): SessionDisplayContext {
	const key = user.user_sso.toLowerCase();
	const preset = DEVELOPER_CONTEXTS_BY_SSO[key];
	const displayName = preset?.displayName ?? displayNameFromSso(user.user_sso);
	return {
		email: user.user_sso,
		displayName,
		avatarUrl: preset?.avatarUrl,
		authProvider: preset?.authProvider ?? "sso",
		authProviderLabel: preset?.authProviderLabel,
		initials: initialsFromDisplayName(displayName, user.user_sso),
	};
}
