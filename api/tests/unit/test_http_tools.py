import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from http_tools import UrlOverrideError, execute_http_tool  # noqa: E402

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
