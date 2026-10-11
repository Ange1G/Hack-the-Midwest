"""Per-agent key/value memory for one run.

The worker loads stored entries; changes are reported in the success callback and the
API validates and applies them. Limits mirror app.domains.memory.schemas.
"""

from __future__ import annotations

import json
import re
from typing import Any

MAX_MEMORY_KEYS = 50
MAX_MEMORY_VALUE_BYTES = 4_096
MAX_MEMORY_WRITES = 50
PREVIEW_CHARS = 120
_KEY = re.compile(r"^[A-Za-z0-9_.:\-]{1,64}$")


class MemoryLimitError(ValueError):
    pass


class MemoryStore:
    def __init__(self, entries: dict[str, Any] | None) -> None:
        self._entries: dict[str, Any] = dict(entries or {})
        self._set: dict[str, Any] = {}
        self._deleted: set[str] = set()

    def list(self) -> str:
        items = [
            {"key": key, "preview": _preview(value)} for key, value in sorted(self._entries.items())
        ]
        return json.dumps({"keys": items}, ensure_ascii=False)

    def get(self, key: str) -> str:
        _check_key(key)
        if key not in self._entries:
            return json.dumps({"key": key, "found": False})
        return json.dumps({"key": key, "found": True, "value": self._entries[key]}, ensure_ascii=False)

    def set(self, key: str, value: str) -> str:
        _check_key(key)
        if len(json.dumps(value).encode()) > MAX_MEMORY_VALUE_BYTES:
            raise MemoryLimitError(f"Value is larger than {MAX_MEMORY_VALUE_BYTES} bytes")
        if key not in self._entries and len(self._entries) >= MAX_MEMORY_KEYS:
            raise MemoryLimitError(f"Memory is full ({MAX_MEMORY_KEYS} keys); delete a key first")
        if key not in self._set and len(self._set) >= MAX_MEMORY_WRITES:
            raise MemoryLimitError(f"At most {MAX_MEMORY_WRITES} keys can be written per run")
        self._entries[key] = value
        self._set[key] = value
        self._deleted.discard(key)
        return json.dumps({"key": key, "saved": True})

    def delete(self, key: str) -> str:
        _check_key(key)
        existed = self._entries.pop(key, None) is not None
        self._set.pop(key, None)
        if existed:
            if len(self._deleted) >= MAX_MEMORY_WRITES:
                raise MemoryLimitError(f"At most {MAX_MEMORY_WRITES} keys can be deleted per run")
            self._deleted.add(key)
        return json.dumps({"key": key, "deleted": existed})

    def writes(self) -> dict[str, Any] | None:
        if not self._set and not self._deleted:
            return None
        return {"set": dict(self._set), "delete": sorted(self._deleted)}


def _check_key(key: str) -> None:
    if not isinstance(key, str) or not _KEY.match(key):
        raise MemoryLimitError("Keys are 1-64 characters of letters, digits, _ . : -")


def _preview(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text[:PREVIEW_CHARS]


def with_memory_writes(payload: dict[str, Any], store: MemoryStore | None) -> dict[str, Any]:
    """Attach memory changes to a success callback; failed runs never write memory."""
    if store is None or payload.get("status") != "succeeded":
        return payload
    writes = store.writes()
    return {**payload, "memory": writes} if writes else payload


def summarize_memory_call(tool: str, key: str | None, text: str) -> dict[str, Any]:
    summary: dict[str, Any] = {"name": f"memory_{tool}", "status": "ok"}
    if key:
        summary["key"] = key
    if tool in {"get", "list"}:
        summary["response_body"] = text[:2_000]
    return summary
