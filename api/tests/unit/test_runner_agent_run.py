import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from agent_run import (  # noqa: E402
    DEFAULT_USER_MESSAGE,
    failure_body,
    output_text,
    parse_manifest,
    run_turn,
    success_body,
    system_prompt_from,
    user_message_from,
)


def test_parse_manifest_and_system_prompt() -> None:
    manifest = parse_manifest('{"title": "A", "system_prompt": "Be terse."}')
    assert system_prompt_from(manifest) == "Be terse."
    assert system_prompt_from({}) == "You are a helpful assistant."
    assert parse_manifest("not-json") == {}


def test_output_text_from_message_blocks() -> None:
    result = SimpleNamespace(
        message={"role": "assistant", "content": [{"text": "Hello "}, {"text": "world"}]}
    )
    assert output_text(result) == "Hello world"


def test_success_body_does_not_include_key() -> None:
    body = success_body("done", "gpt-4o-mini")
    dumped = str(body)
    assert body["result"]["output"] == "done"
    assert "sk-" not in dumped
    assert "OPENAI" not in dumped


def test_run_turn_uses_invoke_and_strips_result() -> None:
    captured: list[tuple[str, str]] = []

    def invoke(prompt: str, user: str) -> SimpleNamespace:
        captured.append((prompt, user))
        return SimpleNamespace(output="  model said this  ")

    body = run_turn(
        manifest={"system_prompt": "Only greet."},
        model_id="gpt-4o-mini",
        invoke=invoke,
    )
    assert captured == [("Only greet.", DEFAULT_USER_MESSAGE)]
    assert body == success_body("model said this", "gpt-4o-mini")


def test_run_turn_uses_supplied_user_message() -> None:
    captured: list[tuple[str, str]] = []

    def invoke(prompt: str, user: str) -> SimpleNamespace:
        captured.append((prompt, user))
        return SimpleNamespace(output="used the input")

    body = run_turn(
        manifest={"system_prompt": "Only greet."},
        model_id="gpt-4o-mini",
        invoke=invoke,
        user_message="  Summarize ticket 42  ",
    )
    assert captured == [("Only greet.", "Summarize ticket 42")]
    assert body["result"]["output"] == "used the input"


def test_user_message_from_blank_falls_back() -> None:
    assert user_message_from(None) == DEFAULT_USER_MESSAGE
    assert user_message_from("   ") == DEFAULT_USER_MESSAGE


def test_failure_body_truncates_code() -> None:
    body = failure_body("x" * 80, "boom")
    assert len(body["error"]["code"]) == 64
    assert body["status"] == "failed"
