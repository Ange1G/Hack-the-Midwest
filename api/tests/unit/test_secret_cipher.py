import pytest

from app.core.secrets import SecretCipher


def test_round_trip() -> None:
    cipher = SecretCipher(SecretCipher.generate_key())
    token = cipher.encrypt("Bearer abc")
    assert token != "Bearer abc"
    assert "Bearer abc" not in token
    assert cipher.decrypt(token) == "Bearer abc"


def test_ciphertext_differs_for_same_plaintext() -> None:
    cipher = SecretCipher(SecretCipher.generate_key())
    assert cipher.encrypt("same") != cipher.encrypt("same")


def test_wrong_key_cannot_decrypt() -> None:
    token = SecretCipher(SecretCipher.generate_key()).encrypt("secret")
    with pytest.raises(ValueError):
        SecretCipher(SecretCipher.generate_key()).decrypt(token)


def test_invalid_key_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError):
        SecretCipher("not-a-valid-key")


def test_derived_secret_is_stable_per_key_and_context() -> None:
    key = SecretCipher.generate_key()
    a, b = SecretCipher(key), SecretCipher(key)
    assert a.derive_secret("db:agent-1:conn-1") == b.derive_secret("db:agent-1:conn-1")
    assert a.derive_secret("db:agent-1:conn-1") != a.derive_secret("db:agent-1:conn-2")
    other = SecretCipher(SecretCipher.generate_key())
    assert other.derive_secret("db:agent-1:conn-1") != a.derive_secret("db:agent-1:conn-1")


def test_derived_secret_is_url_and_env_safe() -> None:
    secret = SecretCipher(SecretCipher.generate_key()).derive_secret("x")
    assert len(secret) == 43
    assert secret.replace("-", "").replace("_", "").isalnum()
