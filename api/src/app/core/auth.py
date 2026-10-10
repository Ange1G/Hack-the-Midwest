from dataclasses import dataclass


@dataclass(frozen=True)
class CurrentUser:
    user_sso: str
