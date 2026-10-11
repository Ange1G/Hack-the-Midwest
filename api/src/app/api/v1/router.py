from fastapi import APIRouter

from app.domains.agents.router import router as agents_router
from app.domains.connectors.router import router as connectors_router
from app.domains.executions.router import internal_router as execution_internal_router
from app.domains.executions.router import router as executions_router
from app.domains.primitives.router import router as connector_types_router
from app.domains.webhooks.router import fire_router as webhook_fire_router
from app.domains.webhooks.router import router as webhooks_router

api_v1_router = APIRouter()
api_v1_router.include_router(executions_router, prefix="/agents", tags=["executions"])
api_v1_router.include_router(agents_router, prefix="/agents", tags=["agents"])
api_v1_router.include_router(connectors_router, prefix="/connectors", tags=["connectors"])
api_v1_router.include_router(
    connector_types_router, prefix="/connector-types", tags=["connectors"]
)
api_v1_router.include_router(
    execution_internal_router, prefix="/internal/executions", tags=["internal"]
)
api_v1_router.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])
api_v1_router.include_router(webhook_fire_router, prefix="/hooks", tags=["webhooks"])
