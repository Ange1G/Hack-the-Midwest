"""Execute bundled HTTP connector tools. The model cannot supply a URL."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx

MAX_BODY_CHARS = 8_000
MAX_PARAM_VALUE_CHARS = 1_024
DEFAULT_TIMEOUT_MS = 10_000


class UrlOverrideError(ValueError):
    pass


class ParamNotAllowedError(ValueError):
    pass


class NotificationError(RuntimeError):
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
    query: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    client: httpx.Client | None = None,
    display_url: str | None = None,
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
    url = _with_query(url, _validated_query(query, spec.get("query_params") or []))
    payload = spec.get("payload") if method == "POST" else None
    if body:
        if method != "POST":
            raise ParamNotAllowedError("GET requests cannot include a body")
        payload = _merged_body(payload, body, spec.get("body_params") or [])
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
                body_text = response.text[:MAX_BODY_CHARS]
                return f"HTTP {response.status_code} {display_url or url}\n{body_text}"
            except httpx.HTTPError as exc:
                last_error = str(exc)
                if attempt >= retries:
                    raise
        return last_error
    finally:
        if close_client:
            client.close()


def execute_notification_tool(
    spec: dict[str, Any],
    credentials: dict[str, str],
    body: dict[str, Any] | None,
    *,
    client: httpx.Client | None = None,
) -> str:
    """POST allowlisted body keys to the destination held in credentials.

    The destination often embeds a token (Slack incoming webhooks), so only its
    scheme and host are returned to the model.
    """
    url = credentials.get("webhookUrl")
    if not isinstance(url, str) or not url:
        raise ValueError("Notification tool is missing its destination")
    if not body:
        raise ParamNotAllowedError("Notification requires at least one body field")
    resolved = {**spec, "URL": url, "method": "POST", "query_params": []}
    label = destination_label(url)
    try:
        return execute_http_tool(
            resolved, credentials, body=body, client=client, display_url=label
        )
    except httpx.HTTPError as exc:
        raise NotificationError(f"Notification to {label} failed: {type(exc).__name__}") from None


def destination_label(url: str | None) -> str:
    parsed = urlparse(url or "")
    if not parsed.scheme or not parsed.hostname:
        return "notification destination"
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{parsed.hostname}{port}"


def summarize_notification_call(
    spec: dict[str, Any], credentials: dict[str, str], status_line: str
) -> dict[str, Any]:
    url = credentials.get("webhookUrl")
    labelled = {**spec, "URL": destination_label(url if isinstance(url, str) else None)}
    return summarize_call(labelled, status_line)


def _validated_query(
    query: dict[str, Any] | None, allowed: list[Any]
) -> dict[str, str]:
    if not query:
        return {}
    allowed_names = [str(name) for name in allowed]
    if not allowed_names:
        raise ParamNotAllowedError("HTTP tool does not allow query parameters")
    extra: dict[str, str] = {}
    for key, value in query.items():
        name = str(key)
        if name not in allowed_names:
            raise ParamNotAllowedError(f"Query parameter {name!r} is not allowed")
        extra[name] = _scalar_query_value(name, value)
    return extra


def _scalar_query_value(name: str, value: Any) -> str:
    if isinstance(value, bool):
        text = "true" if value else "false"
    elif isinstance(value, int) and not isinstance(value, bool):
        text = str(value)
    elif isinstance(value, float):
        text = str(value)
    elif isinstance(value, str):
        text = value
    else:
        raise ParamNotAllowedError(f"Query parameter {name!r} must be a string or number")
    if len(text) > MAX_PARAM_VALUE_CHARS:
        raise ParamNotAllowedError(f"Query parameter {name!r} is too long")
    return text


def _with_query(url: str, extra: dict[str, str]) -> str:
    if not extra:
        return url
    parsed = urlparse(url)
    existing = parse_qsl(parsed.query, keep_blank_values=True)
    existing_keys = {key for key, _ in existing}
    for key in extra:
        if key in existing_keys:
            raise ParamNotAllowedError(
                f"Query parameter {key!r} is fixed on the connector URL"
            )
    merged = existing + list(extra.items())
    return urlunparse(parsed._replace(query=urlencode(merged)))


def _merged_body(
    payload: Any, body: dict[str, Any], allowed: list[Any]
) -> dict[str, Any]:
    allowed_names = [str(name) for name in allowed]
    if not allowed_names:
        raise ParamNotAllowedError("HTTP tool does not allow body parameters")
    if payload is None:
        merged: dict[str, Any] = {}
    elif isinstance(payload, dict):
        merged = dict(payload)
    else:
        raise ParamNotAllowedError(
            "static payload is not an object; cannot apply body parameters"
        )
    for key, value in body.items():
        name = str(key)
        if name not in allowed_names:
            raise ParamNotAllowedError(f"Body parameter {name!r} is not allowed")
        merged[name] = value
    encoded = json.dumps(merged, default=str)
    if len(encoded) > MAX_BODY_CHARS:
        raise ParamNotAllowedError("Request body is too large")
    return merged


def _headers(credentials: dict[str, str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    api_key = credentials.get("xApiKey") or credentials.get("x_api_key")
    auth = credentials.get("authorizationHeader") or credentials.get("authorization_header")
    if api_key:
        headers["X-Api-Key"] = api_key
    if auth:
        headers["Authorization"] = auth
    return headers


def summarize_call(
    spec: dict[str, Any],
    status_line: str,
    *,
    query: dict[str, Any] | None = None,
) -> dict[str, Any]:
    status, body = _status_and_body(status_line, MAX_BODY_CHARS)
    summary: dict[str, Any] = {
        "name": spec.get("name"),
        "method": spec.get("method"),
        "URL": spec.get("URL"),
        "status": status,
    }
    if query:
        summary["query"] = query
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
