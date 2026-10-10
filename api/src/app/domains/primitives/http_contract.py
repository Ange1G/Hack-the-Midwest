"""HTTP contract: the validated description of one HTTP call an agent may make.

Validation runs when a contract is saved, so unsafe or malformed contracts are never
persisted. Execution is out of scope here and belongs to the worker.
"""

import ipaddress
from enum import StrEnum
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    JsonValue,
    model_validator,
)
from pydantic_core import PydanticCustomError

CURRENT_CONTRACT_VERSION = 1
MAX_RETRIES = 5  # team spec
MIN_TIMEOUT_MS = 100  # below this, almost every real request would time out
MAX_TIMEOUT_MS = 60_000  # bounds how long one call can hold a worker
MAX_CREDENTIAL_LENGTH = 4_096  # far above real API keys/tokens; bounds storage

# Shown in place of a stored credential. Never accepted as a credential value.
SECRET_PLACEHOLDER = "********"
# JSON names of the contract fields that hold credentials.
SECRET_FIELDS = ("xApiKey", "authorizationHeader")

_INTERNAL_NAME_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa")


class HttpMethod(StrEnum):
    GET = "GET"
    POST = "POST"


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _ensure_public_target(url: HttpUrl) -> HttpUrl:
    """Reject targets that point inside the platform's network (SSRF).

    This is a save-time check on the literal host. The executor must repeat the check
    on the resolved IP addresses at connect time, because a public hostname can
    resolve to a private address (DNS rebinding).
    """
    host = (urlsplit(str(url)).hostname or "").strip("[]").rstrip(".").lower()
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        if _is_blocked_ip(ip):
            raise PydanticCustomError(
                "unsafe_url", "Private, loopback and link-local addresses are not allowed"
            )
        return url
    if host == "localhost" or host.endswith(_INTERNAL_NAME_SUFFIXES) or "." not in host:
        raise PydanticCustomError("unsafe_url", "Internal hostnames are not allowed")
    return url


def _reject_placeholder(value: str | None) -> str | None:
    if value == SECRET_PLACEHOLDER:
        raise PydanticCustomError(
            "placeholder_credential", "Provide the actual credential, not the placeholder"
        )
    return value


PublicHttpUrl = Annotated[HttpUrl, AfterValidator(_ensure_public_target)]
Credential = Annotated[
    str | None,
    Field(min_length=1, max_length=MAX_CREDENTIAL_LENGTH),
    AfterValidator(_reject_placeholder),
]


class HttpOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    retries: int | None = Field(default=None, ge=0, le=MAX_RETRIES)
    timeout: int | None = Field(
        default=None, ge=MIN_TIMEOUT_MS, le=MAX_TIMEOUT_MS, description="Milliseconds"
    )


class HttpContract(BaseModel):
    """Field names match the team spec on the wire (contractVersion, URL, xApiKey, ...)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    contract_version: Literal[1] = Field(alias="contractVersion")
    method: HttpMethod
    url: PublicHttpUrl = Field(
        validation_alias=AliasChoices("URL", "url"), serialization_alias="URL"
    )
    payload: JsonValue = None
    x_api_key: Credential = Field(default=None, alias="xApiKey")
    authorization_header: Credential = Field(default=None, alias="authorizationHeader")
    options: HttpOptions | None = None

    @model_validator(mode="after")
    def _get_has_no_payload(self) -> "HttpContract":
        if self.method is HttpMethod.GET and self.payload is not None:
            raise PydanticCustomError(
                "payload_not_allowed",
                "GET requests cannot include a payload; put parameters in the URL",
            )
        return self
