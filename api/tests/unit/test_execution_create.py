import pytest
from pydantic import ValidationError

from app.domains.executions.schemas import MAX_RUN_INPUT_LENGTH, ExecutionCreate


def test_blank_input_becomes_none() -> None:
    assert ExecutionCreate().input is None
    assert ExecutionCreate(input="   ").input is None


def test_oversized_input_is_rejected() -> None:
    with pytest.raises(ValidationError) as exc:
        ExecutionCreate(input="x" * (MAX_RUN_INPUT_LENGTH + 1))
    assert "input" in str(exc.value)
