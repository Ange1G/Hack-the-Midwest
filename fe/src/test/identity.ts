import { setCurrentUser, type User } from "#/lib/api/identity";

// Makes the test act as a given development identity; the client sends it as
// the X-Dev-User-SSO header and the mock API scopes everything to it.
export function actAs(user_sso = "angel"): User {
	const user = { user_sso };
	setCurrentUser(user);
	return user;
}
