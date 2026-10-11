"""Encryption for credentials users attach to their agents.

Fernet (from `cryptography`) provides authenticated symmetric encryption: ciphertext
cannot be read or modified without the key. The key comes from the
SECRETS_ENCRYPTION_KEY environment variable and must never be committed.
"""

import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


class SecretCipher:
    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode())
        except (ValueError, TypeError) as exc:
            raise ValueError(
                "SECRETS_ENCRYPTION_KEY is not a valid Fernet key "
                "(32 url-safe base64-encoded bytes)"
            ) from exc
        self._key = base64.urlsafe_b64decode(key.encode())

    @staticmethod
    def generate_key() -> str:
        return Fernet.generate_key().decode()

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise ValueError("Ciphertext could not be decrypted with this key") from exc

    def derive_secret(self, context: str) -> str:
        """A secret for `context`, derived from the key with HKDF-SHA256.

        The same key and context always give the same value, so derived secrets (such as
        passwords of databases the platform provisions) need no storage. Different
        contexts give unrelated values. Changing the key changes every derived secret.
        """
        derived = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"constitution/derived-secret/v1/" + context.encode(),
        ).derive(self._key)
        return base64.urlsafe_b64encode(derived).rstrip(b"=").decode()
