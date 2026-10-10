import type { User } from "#/lib/api/schemas";

export const APP_BRANDING = {
  kicker: "Hack Midwest 2026",
  productName: "Name TBD",
} as const;

export type AuthProvider = "password" | "google" | "github" | "sso";

export type SessionDisplayContext = {
  displayName: string;
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

/** UI-only session display keyed by email (lowercase). Not a security boundary. */
export const DEVELOPER_CONTEXTS_BY_EMAIL: Record<
  string,
  DeveloperContextPreset
> = {
  "admin@example.com": {
    displayName: "Demo Admin",
    authProvider: "password",
    authProviderLabel: "Email & password",
  },
};

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function initialsFromDisplayName(
  displayName: string,
  email: string,
): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

export function resolveDeveloperContext(user: User): SessionDisplayContext {
  const preset = DEVELOPER_CONTEXTS_BY_EMAIL[user.email.toLowerCase()];
  const displayName = preset?.displayName ?? displayNameFromEmail(user.email);
  return {
    email: user.email,
    displayName,
    avatarUrl: preset?.avatarUrl,
    authProvider: preset?.authProvider ?? "password",
    authProviderLabel: preset?.authProviderLabel,
    initials: initialsFromDisplayName(displayName, user.email),
  };
}
