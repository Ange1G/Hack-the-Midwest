import hashlib
import hmac
import secrets


def generate_callback_token() -> str:
    return secrets.token_urlsafe(32)


def hash_callback_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def callback_token_matches(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_callback_token(token), token_hash)
