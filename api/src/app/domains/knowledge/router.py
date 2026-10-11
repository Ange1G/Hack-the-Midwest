import uuid

from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user, get_knowledge_service
from app.common.envelope import ApiEnvelope, ApiMetadata
from app.core.auth import CurrentUser
from app.core.request_context import request_id_ctx
from app.domains.knowledge.schemas import KnowledgeDocumentCreate, KnowledgeDocumentRead
from app.domains.knowledge.service import KnowledgeService

router = APIRouter()


@router.get("/{user_sso}/{connector_id}/documents")
async def list_documents(
    user_sso: str,
    connector_id: uuid.UUID,
    service: KnowledgeService = Depends(get_knowledge_service),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[list[KnowledgeDocumentRead]]:
    documents = await service.list_documents(user_sso, connector_id, caller=caller)
    return ApiEnvelope[list[KnowledgeDocumentRead]](
        data=documents,
        error=None,
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )


@router.post("/{user_sso}/{connector_id}/documents", status_code=status.HTTP_201_CREATED)
async def add_document(
    user_sso: str,
    connector_id: uuid.UUID,
    body: KnowledgeDocumentCreate,
    service: KnowledgeService = Depends(get_knowledge_service),
    caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[KnowledgeDocumentRead]:
    document = await service.add_document(user_sso, connector_id, body, caller=caller)
    return ApiEnvelope[KnowledgeDocumentRead](
        data=document,
        error=None,
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )


@router.delete(
    "/{user_sso}/{connector_id}/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_document(
    user_sso: str,
    connector_id: uuid.UUID,
    document_id: uuid.UUID,
    service: KnowledgeService = Depends(get_knowledge_service),
    caller: CurrentUser = Depends(get_current_user),
) -> None:
    await service.delete_document(user_sso, connector_id, document_id, caller=caller)
