import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from agent_run import run_turn  # noqa: E402
from structured_output import (  # noqa: E402
    OutputValidationError,
    apply_output_schema,
    parse_structured_output,
    schema_instructions,
)

SCHEMA = {
    "type": "object",
    "required": ["severity", "items"],
    "properties": {
        "severity": {"enum": ["low", "high"]},
        "items": {
            "type": "array",
            "items": {"type": "object", "required": ["title"]},
        },
    },
    "additionalProperties": False,
}


def test_parses_json_and_strips_a_code_fence() -> None:
    text = '```json\n{"severity": "low", "items": [{"title": "a"}]}\n```'
    assert parse_structured_output(text, SCHEMA) == {
        "severity": "low",
        "items": [{"title": "a"}],
    }


def test_prose_is_not_json() -> None:
    with pytest.raises(OutputValidationError) as exc:
        parse_structured_output("All good, nothing to report.", SCHEMA)
    assert exc.value.code == "output_invalid_json"


def test_schema_mismatch_names_the_failing_paths() -> None:
    with pytest.raises(OutputValidationError) as exc:
        parse_structured_output(
            '{"severity": "urgent", "items": [{}], "extra": 1}', SCHEMA
        )
    assert exc.value.code == "output_schema_mismatch"
    message = exc.value.message
    assert "$.severity" in message
    assert "$.items[0]" in message and "'title' is a required property" in message
    assert "extra" in message


def test_instructions_embed_the_schema() -> None:
    text = schema_instructions(SCHEMA)
    assert '"required":["severity","items"]' in text
    assert "JSON" in text


def test_apply_without_schema_leaves_the_body_alone() -> None:
    body = {"status": "succeeded", "result": {"output": "hi", "model": "m"}}
    assert apply_output_schema(body, None) is body


def test_apply_adds_parsed_on_success() -> None:
    body = {
        "status": "succeeded",
        "result": {"output": '{"severity": "high", "items": []}', "model": "m"},
    }
    applied = apply_output_schema(body, SCHEMA)
    assert applied["status"] == "succeeded"
    assert applied["result"]["parsed"] == {"severity": "high", "items": []}


def test_apply_fails_the_run_but_keeps_the_raw_output() -> None:
    body = {
        "status": "succeeded",
        "result": {"output": "nope", "model": "m", "tool_calls": [{"name": "t"}]},
    }
    applied = apply_output_schema(body, SCHEMA)
    assert applied["status"] == "failed"
    assert applied["error"]["code"] == "output_invalid_json"
    assert applied["result"] == body["result"]


def test_run_turn_instructs_the_model_and_validates_its_reply() -> None:
    seen: dict[str, str] = {}

    def invoke(system_prompt: str, user_message: str) -> object:
        seen["prompt"] = system_prompt
        return type("R", (), {"output": '{"severity": "low", "items": []}'})()

    body = run_turn(
        manifest={"system_prompt": "Triage alerts.", "output_schema": SCHEMA},
        model_id="m",
        invoke=invoke,
    )

    assert seen["prompt"].startswith("Triage alerts.")
    assert '"additionalProperties":false' in seen["prompt"]
    assert body["status"] == "succeeded"
    assert body["result"]["parsed"] == {"severity": "low", "items": []}


def test_run_turn_without_schema_keeps_free_text() -> None:
    body = run_turn(
        manifest={"system_prompt": "Summarize."},
        model_id="m",
        invoke=lambda prompt, message: type("R", (), {"output": "plain text"})(),
    )
    assert body == {"status": "succeeded", "result": {"output": "plain text", "model": "m"}}
