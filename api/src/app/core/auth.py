from dataclasses import dataclass

from app.core.exceptions import ForbiddenError


@dataclass(frozen=True)
class CurrentUser:
    user_sso: str


def ensure_caller_owns(requested_user_sso: str, caller: CurrentUser) -> None:
    """Users may only act on resources under their own SSO."""
    if caller.user_sso != requested_user_sso:
        raise ForbiddenError("You may not access resources for another user")
