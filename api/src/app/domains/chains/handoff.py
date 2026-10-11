from typing import Any

HANDOFF_PREFIX = "Previous step output:\n"


def output_from_result(result: dict[str, Any] | None) -> str:
    if not result:
        return ""
    output = result.get("output")
    if output is None:
        return ""
    return str(output)


def handoff_input(result: dict[str, Any] | None, *, max_bytes: int) -> str:
    """Bounded next-step input from the prior execution's `result.output`."""
    text = output_from_result(result)
    prefix = HANDOFF_PREFIX
    budget = max(0, max_bytes - len(prefix.encode()))
    encoded = text.encode()
    if len(encoded) > budget:
        text = encoded[:budget].decode("utf-8", errors="ignore")
    return prefix + text
