import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

MAX_DOCUMENT_BYTES = 100_000
MAX_DOCUMENTS_PER_CONNECTOR = 50
MAX_CONNECTOR_BYTES = 1_000_000
EXCERPT_CHARS = 240


class KnowledgeDocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    # Character cap here; the byte cap (UTF-8) is enforced by the service.
    body: Annotated[str, StringConstraints(min_length=1, max_length=MAX_DOCUMENT_BYTES)]


class KnowledgeDocumentRead(BaseModel):
    id: uuid.UUID
    connector_id: uuid.UUID
    title: str
    size_bytes: int
    excerpt: str
    created_at: datetime
