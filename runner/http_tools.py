"""Execute bundled HTTP connector tools. The model cannot supply a URL."""

from __future__ import annotations

import json
from typing import Any

import httpx

MAX_BODY_CHARS = 8_000
DEFAULT_TIMEOUT_MS = 10_000


class UrlOverrideError(ValueError):
    pass


def parse_json_env(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def execute_http_tool(
    spec: dict[str, Any],
    credentials: dict[str, str],
    *,
    url_override: str | None = None,
    client: httpx.Client | None = None,
) -> str:
    if url_override:
        raise UrlOverrideError("HTTP tools cannot override the connector URL")
    url = spec.get("URL")
    if not isinstance(url, str) or not url:
        raise ValueError("HTTP tool is missing a connector URL")
    method = str(spec.get("method") or "GET").upper()
    timeout_s = max(int(spec.get("timeout_ms") or DEFAULT_TIMEOUT_MS), 100) / 1000
    retries = max(int(spec.get("retries") or 0), 0)
    headers = _headers(credentials)
    payload = spec.get("payload") if method == "POST" else None
    close_client = False
    if client is None:
        client = httpx.Client()
        close_client = True
    last_error = "request failed"
    try:
        for attempt in range(retries + 1):
            try:
                response = client.request(
                    method,
                    url,
                    headers=headers or None,
                    json=payload if payload is not None else None,
                    timeout=timeout_s,
                )
                body = response.text[:MAX_BODY_CHARS]
                return f"HTTP {response.status_code} {url}\n{body}"
            except httpx.HTTPError as exc:
                last_error = str(exc)
                if attempt >= retries:
                    raise
        return last_error
    finally:
        if close_client:
            client.close()


def _headers(credentials: dict[str, str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    api_key = credentials.get("xApiKey") or credentials.get("x_api_key")
    auth = credentials.get("authorizationHeader") or credentials.get("authorization_header")
    if api_key:
        headers["X-Api-Key"] = api_key
    if auth:
        headers["Authorization"] = auth
    return headers


def summarize_call(spec: dict[str, Any], status_line: str) -> dict[str, Any]:
    first_line = status_line.split("\n", 1)[0]
    return {
        "name": spec.get("name"),
        "method": spec.get("method"),
        "URL": spec.get("URL"),
        "status": first_line,
    }
