import uuid

from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.exceptions import AppError, NotFoundError
from app.domains.connectors.repository import ConnectorRepository
from app.domains.knowledge.models import KnowledgeDocument
from app.domains.knowledge.repository import KnowledgeRepository
from app.domains.knowledge.schemas import (
    EXCERPT_CHARS,
    MAX_CONNECTOR_BYTES,
    MAX_DOCUMENT_BYTES,
    MAX_DOCUMENTS_PER_CONNECTOR,
    KnowledgeDocumentCreate,
    KnowledgeDocumentRead,
)


class KnowledgeService:
    def __init__(self, documents: KnowledgeRepository, connectors: ConnectorRepository) -> None:
        self._documents = documents
        self._connectors = connectors

    async def list_documents(
        self, owner_user_sso: str, connector_id: uuid.UUID, *, caller: CurrentUser
    ) -> list[KnowledgeDocumentRead]:
        await self._knowledge_connector(owner_user_sso, connector_id, caller)
        documents = await self._documents.list_for_connector(connector_id)
        return [_read(document) for document in documents]

    async def add_document(
        self,
        owner_user_sso: str,
        connector_id: uuid.UUID,
        body: KnowledgeDocumentCreate,
        *,
        caller: CurrentUser,
    ) -> KnowledgeDocumentRead:
        await self._knowledge_connector(owner_user_sso, connector_id, caller)
        size = len(body.body.encode("utf-8"))
        if size > MAX_DOCUMENT_BYTES:
            raise _too_large("body", f"Document is larger than {MAX_DOCUMENT_BYTES} bytes")
        count, total = await self._documents.usage(connector_id)
        if count >= MAX_DOCUMENTS_PER_CONNECTOR:
            raise _too_large(
                "body", f"A knowledge connector holds at most {MAX_DOCUMENTS_PER_CONNECTOR} documents"
            )
        if total + size > MAX_CONNECTOR_BYTES:
            raise _too_large(
                "body", f"A knowledge connector holds at most {MAX_CONNECTOR_BYTES} bytes"
            )
        created = await self._documents.add(
            KnowledgeDocument(
                connector_id=connector_id,
                owner_user_sso=caller.user_sso,
                title=body.title,
                body=body.body,
                size_bytes=size,
            )
        )
        return _read(created)

    async def delete_document(
        self,
        owner_user_sso: str,
        connector_id: uuid.UUID,
        document_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> None:
        await self._knowledge_connector(owner_user_sso, connector_id, caller)
        if not await self._documents.delete(connector_id, document_id):
            raise NotFoundError("Document not found")

    async def _knowledge_connector(
        self, owner_user_sso: str, connector_id: uuid.UUID, caller: CurrentUser
    ) -> None:
        ensure_caller_owns(owner_user_sso, caller)
        types = await self._connectors.types_by_id(owner_user_sso, [connector_id])
        connector_type = types.get(connector_id)
        if connector_type is None:
            raise NotFoundError("Connector not found")
        if connector_type != "knowledge":
            raise AppError(
                code="connector_not_knowledge",
                message="Documents can only be added to knowledge connectors",
                status_code=422,
            )


def _read(document: KnowledgeDocument) -> KnowledgeDocumentRead:
    excerpt = " ".join(document.body.split())[:EXCERPT_CHARS]
    return KnowledgeDocumentRead(
        id=document.id,
        connector_id=document.connector_id,
        title=document.title,
        size_bytes=document.size_bytes,
        excerpt=excerpt,
        created_at=document.created_at,
    )


def _too_large(field: str, message: str) -> AppError:
    return AppError(
        code="knowledge_limit_exceeded",
        message=message,
        status_code=422,
        details={"errors": [{"field": field, "message": message}]},
    )
