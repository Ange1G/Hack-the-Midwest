import json
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from http_tools import (  # noqa: E402
    NotificationError,
    ParamNotAllowedError,
    destination_label,
    execute_notification_tool,
    summarize_notification_call,
)

SLACK_URL = "https://hooks.slack.com/services/T000/B000/secret-token"
SPEC = {
    "id": "n1",
    "name": "slack_alerts",
    "kind": "notification",
    "method": "POST",
    "body_params": ["text"],
    "payload": {"username": "agent"},
    "timeout_ms": 1000,
    "retries": 0,
}
CREDENTIALS = {"webhookUrl": SLACK_URL, "authorizationHeader": "Bearer tok"}


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_posts_model_fields_merged_with_static_payload_to_the_secret_url() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["method"] = request.method
        seen["auth"] = request.headers.get("authorization")
        seen["content_type"] = request.headers.get("content-type")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, text="ok")

    text = execute_notification_tool(
        SPEC, CREDENTIALS, {"text": "Deploy failed"}, client=_client(handler)
    )

    assert seen == {
        "url": SLACK_URL,
        "method": "POST",
        "auth": "Bearer tok",
        "content_type": "application/json",
        "body": {"username": "agent", "text": "Deploy failed"},
    }
    assert text.startswith("HTTP 200 https://hooks.slack.com")
    assert "secret-token" not in text


def test_unknown_body_keys_are_rejected_without_sending() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("must not send")

    with pytest.raises(ParamNotAllowedError):
        execute_notification_tool(
            SPEC, CREDENTIALS, {"channel": "#general"}, client=_client(handler)
        )


def test_empty_body_is_rejected_without_sending() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("must not send")

    with pytest.raises(ParamNotAllowedError):
        execute_notification_tool(SPEC, CREDENTIALS, {}, client=_client(handler))


def test_transport_errors_do_not_leak_the_destination_path() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"cannot reach {request.url}", request=request)

    with pytest.raises(NotificationError) as exc:
        execute_notification_tool(
            SPEC, CREDENTIALS, {"text": "hi"}, client=_client(handler)
        )
    assert "secret-token" not in str(exc.value)
    assert "hooks.slack.com" in str(exc.value)


def test_missing_destination_is_an_error() -> None:
    with pytest.raises(ValueError):
        execute_notification_tool(SPEC, {}, {"text": "hi"})


def test_summary_shows_only_the_destination_host() -> None:
    summary = summarize_notification_call(
        SPEC, CREDENTIALS, "HTTP 200 https://hooks.slack.com\nok"
    )
    assert summary["URL"] == "https://hooks.slack.com"
    assert summary["method"] == "POST"
    assert summary["status"] == "HTTP 200 https://hooks.slack.com"
    assert "secret-token" not in repr(summary)
    assert "Bearer tok" not in repr(summary)


def test_destination_label_drops_path_query_and_userinfo() -> None:
    assert destination_label("https://user:pw@hooks.example.com:8443/a/b?t=1") == (
        "https://hooks.example.com:8443"
    )
    assert destination_label(None) == "notification destination"
