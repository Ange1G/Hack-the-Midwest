// Development identity. The backend trusts the X-Dev-User-SSO header while its
// user-authentication feature is pending; the id is an identifier, not a secret,
// so sessionStorage (cleared when the tab closes) is an acceptable home for it.

export type User = { user_sso: string };

const STORAGE_KEY = "agent-platform.dev-user-sso";

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.sessionStorage;
	} catch {
		return null;
	}
}

export function getSessionUser(): User | null {
	const value = storage()?.getItem(STORAGE_KEY);
	return value ? { user_sso: value } : null;
}

export function setSessionUser(user_sso: string): void {
	storage()?.setItem(STORAGE_KEY, user_sso);
}

export function clearSessionUser(): void {
	storage()?.removeItem(STORAGE_KEY);
}
