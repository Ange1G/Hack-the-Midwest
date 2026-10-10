import json
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

DEFAULT_MAX_EXECUTION_RESULT_BYTES = 1_048_576


class ExecutionRead(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    owner_user_sso: str
    status: str
    result: dict[str, Any] | None
    error_code: str | None
    error_message: str | None
    runner_meta: dict[str, Any] | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExecutionErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=2000)


class ExecutionComplete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["succeeded", "failed"]
    result: dict[str, Any] | None = None
    error: ExecutionErrorBody | None = None

    @model_validator(mode="after")
    def _status_matches_payload(self) -> "ExecutionComplete":
        if self.status == "failed" and self.error is None:
            raise ValueError("failed executions require error")
        if self.status == "succeeded" and self.error is not None:
            raise ValueError("succeeded executions cannot include error")
        encoded = json.dumps(self.result) if self.result is not None else ""
        if len(encoded.encode()) > DEFAULT_MAX_EXECUTION_RESULT_BYTES:
            raise ValueError("result exceeds maximum size")
        return self
