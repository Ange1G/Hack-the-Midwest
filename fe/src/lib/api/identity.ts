import { DEFAULT_DEV_USER_SSO } from "#/config/developer-contexts";

// Development identity. The backend trusts the X-Dev-User-SSO header while its
// user-authentication feature is pending, so the frontend presents a configured
// developer identity on every request. The id is an identifier, not a secret.

export type User = { user_sso: string };

function configuredUser(): User {
	const configured = import.meta.env.VITE_DEV_USER_SSO?.trim();
	return { user_sso: configured || DEFAULT_DEV_USER_SSO };
}

let current = configuredUser();

export function getCurrentUser(): User {
	return current;
}

// Seam for tests and for a future identity switcher.
export function setCurrentUser(user: User): void {
	current = user;
}

export function resetCurrentUser(): void {
	current = configuredUser();
}
