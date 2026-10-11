import hmac
from hashlib import sha256

from app.domains.webhooks.signature import signature_header, signature_matches


SECRET = "whsec_test_secret"
BODY = b'{"ticket":"INC-1"}'


def _hex(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, sha256).hexdigest()


def test_prefixed_and_bare_hex_both_match() -> None:
    digest = _hex(SECRET, BODY)
    assert signature_matches(SECRET, BODY, f"sha256={digest}")
    assert signature_matches(SECRET, BODY, digest)
    assert signature_matches(SECRET, BODY, digest.upper())


def test_wrong_secret_or_body_is_rejected() -> None:
    digest = _hex(SECRET, BODY)
    assert not signature_matches("other", BODY, f"sha256={digest}")
    assert not signature_matches(SECRET, b'{"ticket":"INC-2"}', f"sha256={digest}")


def test_missing_or_malformed_header_is_rejected() -> None:
    digest = _hex(SECRET, BODY)
    assert not signature_matches(SECRET, BODY, None)
    assert not signature_matches(SECRET, BODY, "")
    assert not signature_matches(SECRET, BODY, "not-hex")
    assert not signature_matches(SECRET, BODY, f"sha1={digest}")


def test_signature_header_formats_hex() -> None:
    digest = _hex(SECRET, BODY)
    assert signature_header(SECRET, BODY) == f"sha256={digest}"
