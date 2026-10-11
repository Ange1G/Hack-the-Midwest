from app.domains.executions.tokens import (
    callback_token_matches,
    generate_callback_token,
    hash_callback_token,
)


def test_generated_token_matches_its_hash() -> None:
    token = generate_callback_token()
    digest = hash_callback_token(token)
    assert callback_token_matches(token, digest)
    assert not callback_token_matches("other", digest)
    assert digest != token


def test_hash_is_sha256_hex() -> None:
    digest = hash_callback_token("abc")
    assert len(digest) == 64
    assert digest == hash_callback_token("abc")
