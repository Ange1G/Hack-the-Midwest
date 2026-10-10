from fastapi import APIRouter

from app.domains.agents.router import router as agents_router

api_v1_router = APIRouter()
api_v1_router.include_router(agents_router, prefix="/agents", tags=["agents"])
