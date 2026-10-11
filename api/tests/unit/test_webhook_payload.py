import pytest

from app.domains.executions.schemas import MAX_RUN_INPUT_LENGTH
from app.domains.webhooks.payload import PayloadTooLargeError, body_to_input


def test_json_body_is_compacted() -> None:
    assert body_to_input(b'{\n  "ticket": "INC-1"\n}') == '{"ticket":"INC-1"}'


def test_non_json_body_is_utf8_text() -> None:
    assert body_to_input(b"Summarize yesterday") == "Summarize yesterday"


def test_empty_body_is_none() -> None:
    assert body_to_input(b"") is None
    assert body_to_input(b"   ") is None


def test_invalid_utf8_raises() -> None:
    with pytest.raises(UnicodeDecodeError):
        body_to_input(b"\xff\xfe")


def test_oversized_input_is_rejected() -> None:
    with pytest.raises(PayloadTooLargeError):
        body_to_input(("x" * (MAX_RUN_INPUT_LENGTH + 1)).encode())
