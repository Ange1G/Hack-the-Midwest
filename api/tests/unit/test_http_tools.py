import json
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from http_tools import (  # noqa: E402
    ParamNotAllowedError,
    UrlOverrideError,
    execute_http_tool,
    summarize_call,
)

SPEC = {
    "id": "abc",
    "name": "list_issues",
    "method": "GET",
    "URL": "https://api.example.com/issues",
    "timeout_ms": 1000,
    "retries": 0,
}


def test_execute_uses_bundled_url_and_headers() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.example.com/issues"
        assert request.headers["x-api-key"] == "key-live"
        assert request.headers["authorization"] == "Bearer tok"
        return httpx.Response(200, text='{"ok": true}')

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    text = execute_http_tool(
        SPEC,
        {"xApiKey": "key-live", "authorizationHeader": "Bearer tok"},
        client=client,
    )
    assert "HTTP 200" in text
    assert '{"ok": true}' in text


def test_url_override_is_rejected() -> None:
    with pytest.raises(UrlOverrideError):
        execute_http_tool(SPEC, {}, url_override="https://evil.example")


def test_query_params_are_appended_to_the_bundled_url() -> None:
    spec = {**SPEC, "query_params": ["q", "limit"]}

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.example.com/issues?q=open&limit=10"
        return httpx.Response(200, text="[]")

    text = execute_http_tool(
        spec,
        {},
        query={"q": "open", "limit": 10},
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    assert "q=open" in text


def test_unknown_query_param_is_rejected_without_a_request() -> None:
    called = False

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, text="no")

    with pytest.raises(ParamNotAllowedError, match="state"):
        execute_http_tool(
            {**SPEC, "query_params": ["q"]},
            {},
            query={"state": "open"},
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )
    assert called is False


def test_fixed_url_query_keys_cannot_be_overridden() -> None:
    spec = {
        **SPEC,
        "URL": "https://api.example.com/issues?state=open",
        "query_params": ["state", "q"],
    }
    with pytest.raises(ParamNotAllowedError, match="fixed"):
        execute_http_tool(spec, {}, query={"state": "closed"})


def test_post_body_params_overlay_static_payload() -> None:
    spec = {
        **SPEC,
        "method": "POST",
        "payload": {"source": "agent"},
        "body_params": ["title"],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content) == {"source": "agent", "title": "Outage"}
        return httpx.Response(201, text='{"id": 1}')

    text = execute_http_tool(
        spec,
        {},
        body={"title": "Outage"},
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    assert "HTTP 201" in text


def test_summarize_call_keeps_response_body() -> None:
    summary = summarize_call(SPEC, 'HTTP 200 https://api.example.com/issues\n{"ok": true}')
    assert summary["status"] == "HTTP 200 https://api.example.com/issues"
    assert summary["response_body"] == '{"ok": true}'
    assert summary["name"] == "list_issues"
