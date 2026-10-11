import json
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "runner"))

from mcp_tools import ToolNotAllowedError, call_mcp_tool, summarize_mcp_call  # noqa: E402

SPEC = {
    "id": "mcp-1",
    "name": "linear",
    "URL": "https://mcp.example.com/mcp",
    "transport": "streamableHttp",
    "tools": ["list_issues", "create_issue"],
    "timeout_ms": 2000,
}


def test_call_uses_allowlisted_tool_and_auth_header() -> None:
    calls: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        assert request.headers["authorization"] == "Bearer tok"
        if body.get("method") == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {"protocolVersion": "2025-03-26", "capabilities": {}},
                },
                headers={"Mcp-Session-Id": "sess-1"},
            )
        if body.get("method") == "notifications/initialized":
            return httpx.Response(202)
        assert body["method"] == "tools/call"
        assert body["params"]["name"] == "list_issues"
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": body["id"],
                "result": {"content": [{"type": "text", "text": "issue-1"}]},
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    text = call_mcp_tool(
        SPEC,
        {"authorizationHeader": "Bearer tok"},
        "list_issues",
        {"team": "eng"},
        client=client,
    )
    assert "issue-1" in text
    assert any(call.get("method") == "tools/call" for call in calls)


def test_disallowed_tool_is_rejected() -> None:
    with pytest.raises(ToolNotAllowedError):
        call_mcp_tool(SPEC, {}, "delete_issue", {})


def test_summarize_mcp_call_keeps_response_body() -> None:
    summary = summarize_mcp_call(SPEC, "list_issues", "ok\nissue-1")
    assert summary["status"] == "ok"
    assert summary["response_body"] == "issue-1"
    assert summary["name"] == "linear__list_issues"
