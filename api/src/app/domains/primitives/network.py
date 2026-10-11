"""Outbound-target guard shared by every connector that reaches the network."""

import asyncio
import ipaddress
import re
import socket
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, HttpUrl, StringConstraints
from pydantic_core import PydanticCustomError

_INTERNAL_NAME_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa")
# RFC 1123 hostname, already lower-cased.
_HOSTNAME = re.compile(
    r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$"
)


class UnsafeTargetError(Exception):
    """A connector target resolved to an address the platform refuses to reach."""


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
    _ensure_public(host, "unsafe_url")
    return url


def _ensure_public(host: str, error_type: str) -> None:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        if is_blocked_ip(ip):
            raise PydanticCustomError(
                error_type, "Private, loopback and link-local addresses are not allowed"
            )
        return
    if host == "localhost" or host.endswith(_INTERNAL_NAME_SUFFIXES) or "." not in host:
        raise PydanticCustomError(error_type, "Internal hostnames are not allowed")


# http(s) URL whose host is not internal.
PublicHttpUrl = Annotated[HttpUrl, AfterValidator(ensure_public_target)]


def ensure_public_host(value: str) -> str:
    """Save-time check for a bare host (hostname or IP, no scheme, port or path)."""
    host = value.strip().rstrip(".").lower()
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        if not _HOSTNAME.match(host):
            raise PydanticCustomError(
                "invalid_host", "Enter a hostname or IP address without scheme, port or path"
            ) from None
    else:
        host = str(ip)
    _ensure_public(host, "unsafe_host")
    return host


# Hostname or IP address that is not internal. Re-check at connect time with
# resolve_public_addresses.
PublicHost = Annotated[
    str, StringConstraints(min_length=1, max_length=255), AfterValidator(ensure_public_host)
]


async def resolve_public_addresses(host: str, port: int) -> list[str]:
    """Connect-time check: every address `host` resolves to must be public.

    Raises UnsafeTargetError otherwise, including when the name does not resolve.
    The message names the host but never the resolved addresses.
    """
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise UnsafeTargetError(f"{host} could not be resolved") from None
    addresses = sorted({str(info[4][0]).split("%")[0] for info in infos})
    if not addresses or any(is_blocked_ip(ipaddress.ip_address(a)) for a in addresses):
        raise UnsafeTargetError(f"{host} resolves to an address the platform does not reach")
    return addresses
