import hmac
from hashlib import sha256

_HEX = set("0123456789abcdef")


def signature_header(secret: str, body: bytes) -> str:
    """Integrator header value: `sha256=` plus hex HMAC-SHA256 of the raw body."""
    return f"sha256={_digest(secret, body)}"


def signature_matches(secret: str, body: bytes, header: str | None) -> bool:
    provided = _parse_header(header)
    if provided is None:
        return False
    expected = _digest(secret, body)
    return hmac.compare_digest(provided, expected)


def _digest(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, sha256).hexdigest()


def _parse_header(header: str | None) -> str | None:
    if not header:
        return None
    value = header.strip()
    prefix = "sha256="
    if value[: len(prefix)].lower() == prefix:
        value = value[len(prefix) :]
    value = value.strip().lower()
    if not value or any(char not in _HEX for char in value):
        return None
    return value
