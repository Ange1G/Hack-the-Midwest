"""Trusted-side MCP streamable-HTTP helper used when claiming a run."""

from __future__ import annotations

import json
from typing import Any, Protocol

import httpx

from app.worker.bundle import BundleBuildError

PROTOCOL_VERSION = "2025-03-26"


class McpToolLister(Protocol):
    async def __call__(
        self, url: str, headers: dict[str, str], timeout_s: float
    ) -> list[str]: ...


def mcp_request_headers(credentials: dict[str, str]) -> dict[str, str]:
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


async def list_mcp_tools(url: str, headers: dict[str, str], timeout_s: float) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            session = dict(headers)
            init = await client.post(
                url,
                json=_rpc("initialize", 1, _initialize_params()),
                headers=session,
            )
            _raise_for_status(init, url)
            session_id = init.headers.get("mcp-session-id")
            if session_id:
                session["Mcp-Session-Id"] = session_id
            await client.post(
                url,
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers=session,
            )
            listed = await client.post(
                url, json=_rpc("tools/list", 2), headers=session
            )
            _raise_for_status(listed, url)
            payload = _rpc_payload(listed)
    except httpx.HTTPError as exc:
        raise BundleBuildError("mcp_unavailable", f"MCP server could not be reached: {url}") from exc
    error = payload.get("error")
    if error:
        raise BundleBuildError(
            "mcp_unavailable",
            f"MCP tools/list failed: {error.get('message') or error}",
        )
    tools = (payload.get("result") or {}).get("tools") or []
    names = [str(tool["name"]) for tool in tools if isinstance(tool, dict) and tool.get("name")]
    return names


def _initialize_params() -> dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": {"name": "agent-platform-worker", "version": "1"},
    }


def _rpc(method: str, rpc_id: int, params: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"jsonrpc": "2.0", "id": rpc_id, "method": method}
    if params is not None:
        body["params"] = params
    return body


def _raise_for_status(response: httpx.Response, url: str) -> None:
    if response.status_code >= 400:
        raise BundleBuildError(
            "mcp_unavailable",
            f"MCP server at {url} returned HTTP {response.status_code}",
        )


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
        if last is None:
            raise BundleBuildError("mcp_unavailable", "MCP server returned an empty stream")
        return last
    try:
        payload = response.json()
    except json.JSONDecodeError as exc:
        raise BundleBuildError("mcp_unavailable", "MCP server returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise BundleBuildError("mcp_unavailable", "MCP server returned an invalid payload")
    return payload
