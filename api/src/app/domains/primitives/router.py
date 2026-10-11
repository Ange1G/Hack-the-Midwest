from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.common.envelope import ApiEnvelope, ApiMetadata
from app.core.auth import CurrentUser
from app.core.request_context import request_id_ctx
from app.domains.primitives.registry import connector_catalog
from app.domains.primitives.schemas import ConnectorTypeRead

router = APIRouter()


@router.get("")
async def list_connector_types(
    _caller: CurrentUser = Depends(get_current_user),
) -> ApiEnvelope[list[ConnectorTypeRead]]:
    """Connector types users can create, with the JSON Schema of each contract."""
    return ApiEnvelope[list[ConnectorTypeRead]](
        data=[ConnectorTypeRead.model_validate(entry) for entry in connector_catalog()],
        error=None,
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )
