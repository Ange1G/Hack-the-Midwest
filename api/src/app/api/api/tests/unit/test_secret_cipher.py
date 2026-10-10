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
