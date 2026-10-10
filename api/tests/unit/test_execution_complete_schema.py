import pytest
from pydantic import ValidationError

from app.domains.executions import schemas as execution_schemas
from app.domains.executions.schemas import ExecutionComplete


def test_failed_requires_error() -> None:
    with pytest.raises(ValidationError):
        ExecutionComplete(status="failed")


def test_succeeded_rejects_error() -> None:
    with pytest.raises(ValidationError):
        ExecutionComplete(status="succeeded", error={"code": "x", "message": "nope"})


def test_result_size_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(execution_schemas, "DEFAULT_MAX_EXECUTION_RESULT_BYTES", 8)
    with pytest.raises(ValidationError):
        ExecutionComplete(status="succeeded", result={"payload": "too-big"})
