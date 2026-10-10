import type { User } from "#/lib/api/session";
import { setSessionUser } from "#/lib/api/session";

// Signs the test in as a development identity; the client then sends it as
// the X-Dev-User-SSO header and the mock API scopes everything to it.
export function signInAs(user_sso = "angel"): User {
	setSessionUser(user_sso);
	return { user_sso };
}
