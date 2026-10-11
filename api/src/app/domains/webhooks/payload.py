import json

from app.domains.executions.schemas import MAX_RUN_INPUT_LENGTH


class PayloadTooLargeError(ValueError):
    """Mapped webhook body exceeds the execution input limit."""


def body_to_input(raw: bytes, *, max_length: int = MAX_RUN_INPUT_LENGTH) -> str | None:
    """MVP mapping: compact JSON when the body is JSON, otherwise UTF-8 text.

    Signature verification uses the raw body; this only derives `Execution.input`.
    """
    text = raw.decode("utf-8")
    stripped = text.strip()
    if not stripped:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        mapped = text
    else:
        mapped = json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
    if len(mapped) > max_length:
        raise PayloadTooLargeError("Webhook body exceeds maximum input size")
    return mapped
