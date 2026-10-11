"""Delegate agents: other agents of the same owner, called as tools within one run."""

from __future__ import annotations

import threading
from typing import Any

MAX_DELEGATE_CALLS = 5
MAX_TASK_CHARS = 4_000
MAX_DELEGATE_OUTPUT_CHARS = 8_000


class DelegateLimitError(RuntimeError):
    pass


class DelegateBudget:
    """Caps delegate calls per run across all delegates (tools may run concurrently)."""

    def __init__(self, limit: int = MAX_DELEGATE_CALLS) -> None:
        self._remaining = limit
        self._lock = threading.Lock()

    def take(self) -> None:
        with self._lock:
            if self._remaining <= 0:
                raise DelegateLimitError(
                    f"Delegate call limit reached ({MAX_DELEGATE_CALLS} per run)"
                )
            self._remaining -= 1


def delegate_description(spec: dict[str, Any]) -> str:
    title = str(spec.get("title") or "agent")
    return (
        f"Hand a self-contained task to the '{title}' agent and get its final answer. "
        "Include every detail it needs in `task`; it cannot see this conversation."
    )


def delegate_task(task: str) -> str:
    text = (task or "").strip()
    if not text:
        raise ValueError("task must not be empty")
    return text[:MAX_TASK_CHARS]


def summarize_delegate_call(spec: dict[str, Any], output: str) -> dict[str, Any]:
    return {
        "name": spec.get("tool_name"),
        "agent_id": spec.get("agent_id"),
        "agent_title": spec.get("title"),
        "status": "ok",
        "response_body": output[:MAX_DELEGATE_OUTPUT_CHARS],
    }
