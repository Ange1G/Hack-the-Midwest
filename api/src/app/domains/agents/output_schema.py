"""Optional JSON Schema the agent's final reply must match (`configurations.outputSchema`).

The runner validates the reply after the model finishes. Only local `$ref`s
(`#/...`) are accepted so validation can never fetch a remote document.
"""

import json
from collections.abc import Iterator
from typing import Annotated, Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from pydantic import AfterValidator
from pydantic_core import PydanticCustomError

MAX_OUTPUT_SCHEMA_CHARS = 16_000


def _refs(node: Any) -> Iterator[Any]:
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref":
                yield value
            else:
                yield from _refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from _refs(item)


def validate_output_schema(schema: dict[str, Any]) -> dict[str, Any]:
    if len(json.dumps(schema)) > MAX_OUTPUT_SCHEMA_CHARS:
        raise PydanticCustomError(
            "output_schema_too_large",
            "outputSchema must be at most {limit} characters of JSON",
            {"limit": MAX_OUTPUT_SCHEMA_CHARS},
        )
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise PydanticCustomError(
            "invalid_output_schema",
            "outputSchema is not a valid JSON Schema: {reason}",
            {"reason": exc.message[:300]},
        ) from None
    if any(not (isinstance(ref, str) and ref.startswith("#")) for ref in _refs(schema)):
        raise PydanticCustomError(
            "output_schema_remote_ref",
            "outputSchema may only use local $ref values that start with #",
        )
    return schema


OutputSchema = Annotated[dict[str, Any], AfterValidator(validate_output_schema)]
