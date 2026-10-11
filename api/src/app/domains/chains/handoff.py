import json
from typing import Any

HANDOFF_PREFIX = "Previous step output:\n"
TOOLS_PREFIX = "Previous step tool results:\n"


def output_from_result(result: dict[str, Any] | None) -> str:
    """Prior step text; compact JSON when the runner validated a structured reply."""
    if not result:
        return ""
    if "parsed" in result:
        return json.dumps(result["parsed"], separators=(",", ":"), ensure_ascii=False)
    output = result.get("output")
    if output is None:
        return ""
    return str(output)


def tool_bodies_from_result(result: dict[str, Any] | None) -> list[tuple[str, str]]:
    if not result:
        return []
    calls = result.get("tool_calls")
    if not isinstance(calls, list):
        return []
    bodies: list[tuple[str, str]] = []
    for call in calls:
        if not isinstance(call, dict):
            continue
        body = call.get("response_body")
        if not isinstance(body, str) or not body.strip():
            continue
        name = call.get("name")
        label = str(name) if name else "tool"
        bodies.append((label, body))
    return bodies


def handoff_input(result: dict[str, Any] | None, *, max_bytes: int) -> str:
    """Bounded next-step input from prior `result.output` and tool response bodies."""
    prefix = HANDOFF_PREFIX
    remaining = max(0, max_bytes - len(prefix.encode()))
    fitted_output = _fit(output_from_result(result), remaining)
    text = prefix + fitted_output
    leftover = max_bytes - len(text.encode())
    tools = tool_bodies_from_result(result)
    if not tools or leftover <= 0:
        return text
    return _append_tools(text, tools, leftover)


def _append_tools(text: str, tools: list[tuple[str, str]], leftover: int) -> str:
    header = "\n\n" + TOOLS_PREFIX
    header_size = len(header.encode())
    if leftover <= header_size:
        return text
    parts = [text, header]
    leftover -= header_size
    for index, (name, body) in enumerate(tools):
        block = f"[{name}]\n{body}"
        if index > 0:
            block = "\n\n" + block
        encoded = block.encode()
        if len(encoded) <= leftover:
            parts.append(block)
            leftover -= len(encoded)
            continue
        fitted = _fit(block, leftover)
        if fitted:
            parts.append(fitted)
        break
    return "".join(parts)


def _fit(text: str, budget: int) -> str:
    if budget <= 0:
        return ""
    encoded = text.encode()
    if len(encoded) <= budget:
        return text
    return encoded[:budget].decode("utf-8", errors="ignore")
