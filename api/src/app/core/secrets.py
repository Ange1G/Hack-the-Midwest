"""Encryption for credentials users attach to their agents.

Fernet (from `cryptography`) provides authenticated symmetric encryption: ciphertext
cannot be read or modified without the key. The key comes from the
SECRETS_ENCRYPTION_KEY environment variable and must never be committed.
"""

from cryptography.fernet import Fernet, InvalidToken


class SecretCipher:
    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode())
        except (ValueError, TypeError) as exc:
            raise ValueError(
                "SECRETS_ENCRYPTION_KEY is not a valid Fernet key "
                "(32 url-safe base64-encoded bytes)"
            ) from exc

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
