import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

import entrypoint  # noqa: E402

SPEC = {"id": "n1", "name": "slack_alerts", "kind": "notification", "body_params": ["text"]}
SECRET_URL = "https://hooks.slack.com/services/T/B/secret-token"


def fake_tool(*, name: str):
    def register(fn):
        fn.registered_name = name
        return fn

    return register


def test_notification_tool_describes_its_fields_and_records_a_safe_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: dict = {}

    def fake_execute(spec: dict, creds: dict, body: dict) -> str:
        sent.update(spec=spec, creds=creds, body=body)
        return "HTTP 200 https://hooks.slack.com\nok"

    monkeypatch.setattr(entrypoint, "execute_notification_tool", fake_execute)
    entrypoint.TOOL_CALLS.clear()

    registered = entrypoint._notification_tool(
        fake_tool, SPEC, {"n1": {"webhookUrl": SECRET_URL}}
    )
    result = registered({"text": "Deploy failed"})

    assert registered.registered_name == "slack_alerts"
    assert "text" in registered.__doc__
    assert sent["body"] == {"text": "Deploy failed"}
    assert sent["creds"] == {"webhookUrl": SECRET_URL}
    assert result.startswith("HTTP 200")
    assert entrypoint.TOOL_CALLS[-1]["URL"] == "https://hooks.slack.com"
    assert "secret-token" not in repr(entrypoint.TOOL_CALLS)
