"""Outbound-target guard shared by every connector that reaches the network."""

import ipaddress
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, HttpUrl
from pydantic_core import PydanticCustomError

_INTERNAL_NAME_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa")


def is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
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


def ensure_public_target(url: HttpUrl) -> HttpUrl:
    """Reject targets that point inside the platform's network (SSRF).

    This is a save-time check on the literal host. Whatever executes the connector must
    repeat the check on the resolved IP addresses at connect time, because a public
    hostname can resolve to a private address (DNS rebinding).
    """
    host = (urlsplit(str(url)).hostname or "").strip("[]").rstrip(".").lower()
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        if is_blocked_ip(ip):
            raise PydanticCustomError(
                "unsafe_url", "Private, loopback and link-local addresses are not allowed"
            )
        return url
    if host == "localhost" or host.endswith(_INTERNAL_NAME_SUFFIXES) or "." not in host:
        raise PydanticCustomError("unsafe_url", "Internal hostnames are not allowed")
    return url


# http(s) URL whose host is not internal.
PublicHttpUrl = Annotated[HttpUrl, AfterValidator(ensure_public_target)]
