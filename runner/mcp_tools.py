"""Call allowlisted MCP tools over streamable HTTP. The model cannot add tools."""

from __future__ import annotations

import json
from typing import Any

import httpx

PROTOCOL_VERSION = "2025-03-26"
MAX_RESULT_CHARS = 8_000
DEFAULT_TIMEOUT_MS = 10_000


class ToolNotAllowedError(ValueError):
    pass


def call_mcp_tool(
    spec: dict[str, Any],
    credentials: dict[str, str],
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    *,
    client: httpx.Client | None = None,
) -> str:
    allowed = spec.get("tools") or []
    if tool_name not in allowed:
        raise ToolNotAllowedError(f"MCP tool {tool_name!r} is not allowed for this agent")
    url = spec.get("URL")
    if not isinstance(url, str) or not url:
        raise ValueError("MCP tool is missing a server URL")
    timeout_s = max(int(spec.get("timeout_ms") or DEFAULT_TIMEOUT_MS), 100) / 1000
    headers = _headers(credentials)
    close_client = False
    if client is None:
        client = httpx.Client(timeout=timeout_s)
        close_client = True
    try:
        init = client.post(url, json=_rpc("initialize", 1, _initialize_params()), headers=headers)
        init.raise_for_status()
        session_id = init.headers.get("mcp-session-id")
        if session_id:
            headers = {**headers, "Mcp-Session-Id": session_id}
        client.post(
            url,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers=headers,
        )
        response = client.post(
            url,
            json=_rpc(
                "tools/call",
                2,
                {"name": tool_name, "arguments": arguments or {}},
            ),
            headers=headers,
        )
        response.raise_for_status()
        payload = _rpc_payload(response)
        error = payload.get("error")
        if error:
            raise RuntimeError(str(error.get("message") or error))
        return _format_result(payload.get("result"))
    finally:
        if close_client:
            client.close()


def summarize_mcp_call(spec: dict[str, Any], tool_name: str, text: str) -> dict[str, Any]:
    status, body = _status_and_body(text, MAX_RESULT_CHARS)
    summary: dict[str, Any] = {
        "name": f"{spec.get('name')}__{tool_name}",
        "mcp_tool": tool_name,
        "URL": spec.get("URL"),
        "status": status,
    }
    if body:
        summary["response_body"] = body
    return summary


def _status_and_body(text: str, max_body: int) -> tuple[str, str | None]:
    first, sep, rest = text.partition("\n")
    status = first[:200]
    if not sep:
        return status, None
    body = rest[:max_body]
    return status, body or None


def _headers(credentials: dict[str, str]) -> dict[str, str]:
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }
    api_key = credentials.get("xApiKey") or credentials.get("x_api_key")
    auth = credentials.get("authorizationHeader") or credentials.get("authorization_header")
    if api_key:
        headers["X-Api-Key"] = api_key
    if auth:
        headers["Authorization"] = auth
    return headers


def _initialize_params() -> dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": {"name": "agent-platform-runner", "version": "1"},
    }


def _rpc(method: str, rpc_id: int, params: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"jsonrpc": "2.0", "id": rpc_id, "method": method}
    if params is not None:
        body["params"] = params
    return body


def _rpc_payload(response: httpx.Response) -> dict[str, Any]:
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        last: dict[str, Any] | None = None
        for line in response.text.splitlines():
            if line.startswith("data:"):
                raw = line[5:].strip()
                if raw:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        last = parsed
        return last or {}
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def _format_result(result: object) -> str:
    if isinstance(result, dict):
        content = result.get("content")
        if isinstance(content, list):
            texts = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    texts.append(item["text"])
            if texts:
                return "\n".join(texts)[:MAX_RESULT_CHARS]
    return json.dumps(result, default=str)[:MAX_RESULT_CHARS]
