from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.exceptions import UnauthorizedError
from app.domains.agents.controller import AgentsController
from app.domains.agents.repository import SqlAlchemyAgentRepository
from app.domains.agents.service import AgentService
from app.core.exceptions import AppError
from app.core.secrets import SecretCipher
from app.domains.connectors.controller import ConnectorsController
from app.domains.connectors.repository import SqlAlchemyConnectorRepository
from app.domains.connectors.service import ConnectorService
from app.domains.executions.controller import ExecutionsController
from app.domains.executions.repository import SqlAlchemyExecutionRepository
from app.domains.executions.service import ExecutionService
from app.domains.webhooks.controller import WebhooksController
from app.domains.webhooks.rate_limit import webhook_rate_limiter
from app.domains.webhooks.repository import SqlAlchemyWebhookRepository
from app.domains.webhooks.service import WebhookService


async def get_current_user(
    settings: Settings = Depends(get_settings),
    x_dev_user_sso: str | None = Header(default=None, alias="X-Dev-User-SSO"),
) -> CurrentUser:
    if settings.app_env == "development" or settings.app_env == "test":
        if not x_dev_user_sso:
            raise UnauthorizedError(
                "Missing X-Dev-User-SSO header (required in development/test)",
            )
        return CurrentUser(user_sso=x_dev_user_sso)
    raise UnauthorizedError(
        "Production authentication is not configured",
    )


async def get_agent_service(
    session: AsyncSession = Depends(get_db),
) -> AgentService:
    repository = SqlAlchemyAgentRepository(session)
    return AgentService(repository)


async def get_agents_controller(
    service: AgentService = Depends(get_agent_service),
    settings: Settings = Depends(get_settings),
) -> AgentsController:
    return AgentsController(service=service, settings=settings)


def get_secret_cipher(settings: Settings = Depends(get_settings)) -> SecretCipher | None:
    """None when no key is configured; callers refuse to store credentials then."""
    key = settings.secrets_encryption_key
    if key is None or not key.get_secret_value():
        return None
    try:
        return SecretCipher(key.get_secret_value())
    except ValueError:
        raise AppError(
            code="secret_storage_misconfigured",
            message="Credential storage is misconfigured on this server",
            status_code=500,
        ) from None


async def get_connector_repository(
    session: AsyncSession = Depends(get_db),
) -> SqlAlchemyConnectorRepository:
    return SqlAlchemyConnectorRepository(session)


async def get_connectors_controller(
    repository: SqlAlchemyConnectorRepository = Depends(get_connector_repository),
    settings: Settings = Depends(get_settings),
) -> ConnectorsController:
    return ConnectorsController(service=ConnectorService(repository), settings=settings)


async def get_executions_controller(
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ExecutionsController:
    service = ExecutionService(
        SqlAlchemyExecutionRepository(session),
        SqlAlchemyAgentRepository(session),
    )
    return ExecutionsController(service=service, settings=settings)


async def get_webhooks_controller(
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> WebhooksController:
    agents = SqlAlchemyAgentRepository(session)
    executions = ExecutionService(
        SqlAlchemyExecutionRepository(session),
        agents,
    )
    service = WebhookService(
        SqlAlchemyWebhookRepository(session),
        agents,
        executions,
        rate_limiter=webhook_rate_limiter,
    )
    return WebhooksController(service=service, settings=settings)
