from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiError(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class Pagination(BaseModel):
    page: int = Field(ge=1)
    page_size: int = Field(ge=1)
    total_items: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class ApiMetadata(BaseModel):
    request_id: str


class ApiEnvelope(BaseModel, Generic[T]):
    data: T | None = None
    error: ApiError | None = None
    metadata: ApiMetadata
    pagination: Pagination | None = None
