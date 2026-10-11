import json
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints, field_validator

MAX_MEMORY_KEYS = 50
MAX_MEMORY_VALUE_BYTES = 4_096
MAX_MEMORY_WRITES = 50
MEMORY_KEY_PATTERN = r"^[A-Za-z0-9_.:\-]{1,64}$"

MemoryKey = Annotated[str, StringConstraints(pattern=MEMORY_KEY_PATTERN)]


class MemoryWrites(BaseModel):
    """Memory changes a run reports in its success callback. Untrusted: from the container."""

    model_config = ConfigDict(extra="forbid")

    set: dict[MemoryKey, JsonValue] = Field(default_factory=dict, max_length=MAX_MEMORY_WRITES)
    delete: list[MemoryKey] = Field(default_factory=list, max_length=MAX_MEMORY_WRITES)

    @field_validator("set")
    @classmethod
    def _bounded_values(cls, values: dict[str, JsonValue]) -> dict[str, JsonValue]:
        for key, value in values.items():
            if len(json.dumps(value).encode()) > MAX_MEMORY_VALUE_BYTES:
                raise ValueError(f"memory value for {key!r} exceeds {MAX_MEMORY_VALUE_BYTES} bytes")
        return values


class MemoryEntryRead(BaseModel):
    key: str
    value: JsonValue
    updated_at: datetime

    model_config = {"from_attributes": True}
