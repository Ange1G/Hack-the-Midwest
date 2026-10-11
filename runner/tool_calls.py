"""Record tool calls for `result.tool_calls`. Summaries never receive credentials."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

MAX_ARGUMENT_CHARS = 1_000
MAX_ERROR_CHARS = 300


def arguments_preview(arguments: Any) -> str | None:
    if arguments in (None, {}, []):
        return None
    try:
        text = json.dumps(arguments, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        text = str(arguments)
    return text[:MAX_ARGUMENT_CHARS]


def http_ok(summary: dict[str, Any]) -> bool:
    status = str(summary.get("status") or "")
    parts = status.split(" ", 2)
    if len(parts) >= 2 and parts[0] == "HTTP" and parts[1].isdigit():
        return int(parts[1]) < 400
    return True


def tracked_call(
    calls: list[dict[str, Any]],
    *,
    kind: str,
    name: str,
    call: Callable[[], str],
    summarize: Callable[[str], dict[str, Any]],
    arguments: Any = None,
    delegate: str | None = None,
    ok: Callable[[dict[str, Any]], bool] | None = None,
) -> str:
    """Run one tool call and append its summary, including failures, then return its text.

    Exceptions are recorded and re-raised so the agent framework reports them to the model.
    """
    started = time.monotonic()
    try:
        text = call()
    except Exception as exc:
        summary = {"name": name, "status": f"error: {str(exc)[:MAX_ERROR_CHARS]}"}
        calls.append(_finish(summary, kind, started, False, arguments, delegate))
        raise
    summary = summarize(text)
    succeeded = ok(summary) if ok is not None else True
    calls.append(_finish(summary, kind, started, succeeded, arguments, delegate))
    return text


def _finish(
    summary: dict[str, Any],
    kind: str,
    started: float,
    ok: bool,
    arguments: Any,
    delegate: str | None,
) -> dict[str, Any]:
    finished = {
        **summary,
        "kind": kind,
        "ok": ok,
        "duration_ms": int((time.monotonic() - started) * 1000),
    }
    preview = arguments_preview(arguments)
    if preview is not None:
        finished["arguments"] = preview
    if delegate:
        finished["delegate"] = delegate
    return finished
