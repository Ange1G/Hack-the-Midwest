"""Validate the agent's final reply against the JSON Schema stored on the agent.

The schema is checked when the agent is saved (only local `$ref`s are allowed, so
validation never fetches anything). Failures here fail the run, keeping the raw output
so the user can see what the model produced.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError
from referencing.exceptions import Unresolvable

MAX_REPORTED_ERRORS = 5
MAX_ERROR_LINE_CHARS = 300
_FENCE = re.compile(r"^```[A-Za-z0-9_-]*\s*\n(.*?)\n?```$", re.DOTALL)


class OutputValidationError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def output_schema_from(manifest: dict[str, Any]) -> dict[str, Any] | None:
    schema = manifest.get("output_schema")
    return schema if isinstance(schema, dict) else None


def schema_instructions(schema: dict[str, Any]) -> str:
    compact = json.dumps(schema, separators=(",", ":"))
    return (
        "\n\nWhen you are done, reply with only a JSON value that matches this JSON "
        "Schema. Do not add prose or code fences.\n"
        f"JSON Schema: {compact}"
    )


def parse_structured_output(text: str, schema: dict[str, Any]) -> Any:
    candidate = text.strip()
    fenced = _FENCE.match(candidate)
    if fenced:
        candidate = fenced.group(1).strip()
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise OutputValidationError(
            "output_invalid_json", f"Agent output is not valid JSON: {exc.msg}"
        ) from None
    try:
        validator = Draft202012Validator(schema)
        validator.check_schema(schema)
        errors = sorted(validator.iter_errors(value), key=_error_sort_key)
    except SchemaError as exc:
        raise OutputValidationError(
            "output_schema_invalid", f"The agent's output schema is invalid: {exc.message}"
        ) from None
    except Unresolvable as exc:
        raise OutputValidationError(
            "output_schema_invalid", f"The agent's output schema has an unresolvable $ref: {exc}"
        ) from None
    if errors:
        raise OutputValidationError("output_schema_mismatch", _describe(errors))
    return value


def apply_output_schema(body: dict[str, Any], schema: dict[str, Any] | None) -> dict[str, Any]:
    """Add `result.parsed` to a success body, or turn it into a failure that keeps the output."""
    if schema is None or body.get("status") != "succeeded":
        return body
    result = body.get("result") or {}
    try:
        parsed = parse_structured_output(str(result.get("output") or ""), schema)
    except OutputValidationError as exc:
        return {
            "status": "failed",
            "result": result,
            "error": {"code": exc.code[:64], "message": exc.message[:2000]},
        }
    return {**body, "result": {**result, "parsed": parsed}}


def _error_sort_key(error: ValidationError) -> list[str]:
    return [str(part) for part in error.absolute_path]


def _json_path(parts: Iterable[Any]) -> str:
    path = "$"
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def _describe(errors: list[ValidationError]) -> str:
    # Messages quote the offending value, which can be arbitrarily large.
    lines = [
        f"{_json_path(e.absolute_path)}: {e.message}"[:MAX_ERROR_LINE_CHARS]
        for e in errors[:MAX_REPORTED_ERRORS]
    ]
    hidden = len(errors) - MAX_REPORTED_ERRORS
    if hidden > 0:
        lines.append(f"…and {hidden} more")
    return "Agent output does not match the output schema:\n" + "\n".join(lines)
