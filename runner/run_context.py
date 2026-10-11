"""Read the run context the worker writes to stdin (knowledge, memory, delegates)."""

from __future__ import annotations

import json
from typing import IO, Any

MAX_CONTEXT_BYTES = 8_000_000

EMPTY_CONTEXT: dict[str, Any] = {
    "knowledge_ids": [],
    "knowledge": [],
    "memory": None,
    "delegates": [],
}


class RunContextError(ValueError):
    pass


def read_run_context(stream: IO[str] | None, *, enabled: bool) -> dict[str, Any]:
    if not enabled or stream is None:
        return dict(EMPTY_CONTEXT)
    raw = stream.read(MAX_CONTEXT_BYTES + 1)
    if len(raw) > MAX_CONTEXT_BYTES:
        raise RunContextError("Run context is too large")
    try:
        parsed = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        raise RunContextError(f"Run context is not valid JSON: {exc.msg}") from None
    if not isinstance(parsed, dict):
        raise RunContextError("Run context must be a JSON object")
    context = dict(EMPTY_CONTEXT)
    for key in ("knowledge_ids", "knowledge", "delegates"):
        value = parsed.get(key)
        if isinstance(value, list):
            context[key] = value
    memory = parsed.get("memory")
    if isinstance(memory, dict):
        entries = memory.get("entries")
        context["memory"] = {"entries": entries if isinstance(entries, dict) else {}}
    return context
