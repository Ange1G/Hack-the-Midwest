"""Build Strands callback payloads. Keep secrets out of result JSON."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

DEFAULT_USER_MESSAGE = "Execute your instructions and return a concise summary."
MAX_OUTPUT_CHARS = 32_000


def parse_manifest(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def system_prompt_from(manifest: dict[str, Any]) -> str:
    prompt = manifest.get("system_prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt
    return "You are a helpful assistant."


def output_text(result: object) -> str:
    for attr in ("output", "text"):
        value = getattr(result, attr, None)
        if isinstance(value, str) and value.strip():
            return value.strip()[:MAX_OUTPUT_CHARS]
    message = getattr(result, "message", None)
    extracted = _text_from_message(message)
    if extracted:
        return extracted[:MAX_OUTPUT_CHARS]
    return str(result).strip()[:MAX_OUTPUT_CHARS]


def _text_from_message(message: object) -> str:
    if isinstance(message, str):
        return message.strip()
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict) and isinstance(item.get("text"), str):
            parts.append(item["text"])
    return "".join(parts).strip()


def success_body(
    output: str, model: str, tool_calls: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    result: dict[str, Any] = {"output": output, "model": model}
    if tool_calls:
        result["tool_calls"] = tool_calls
    return {"status": "succeeded", "result": result}


def failure_body(code: str, message: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error": {"code": code[:64], "message": message[:2000]},
    }


def run_turn(
    *,
    manifest: dict[str, Any],
    model_id: str,
    invoke: Callable[[str, str], object],
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    prompt = system_prompt_from(manifest)
    result = invoke(prompt, DEFAULT_USER_MESSAGE)
    return success_body(output_text(result), model_id, tool_calls)
