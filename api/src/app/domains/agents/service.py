from app.core.auth import CurrentUser
from app.common.pagination import clamp_page_size, total_pages
from app.core.config import Settings
from app.core.exceptions import ForbiddenError
from pydantic import ValidationError

from app.core.exceptions import AppError
from app.core.secrets import SecretCipher
from app.domains.agents.configurations import AgentConfigurations, split_secrets
from app.domains.agents.models import Agent, AgentSecret
from app.domains.agents.schemas import AgentCreate
from app.domains.agents.repository import AgentRepository
from app.domains.agents.schemas import AgentRead


class AgentService:
    def __init__(self, repository: AgentRepository) -> None:
        self._repository = repository

    def _ensure_caller_may_access(self, requested_user_sso: str, caller: CurrentUser) -> None:
        if caller.user_sso != requested_user_sso:
            raise ForbiddenError(
                "You may not access agents for another user",
            )

    async def list_agents_for_owner(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
        settings: Settings,
    ) -> tuple[list[AgentRead], int, int, int]:
        self._ensure_caller_may_access(owner_user_sso, caller)
        bounded_page_size = clamp_page_size(page_size, settings.max_page_size)
        agents, total_items = await self._repository.list_by_owner(
            owner_user_sso,
            page=page,
            page_size=bounded_page_size,
        )
        items = [AgentRead.model_validate(a) for a in agents]
        return (
            items,
            total_items,
            page,
            bounded_page_size,
        )

    async def create_agent(
        self,
        owner_user_sso: str,
        body: AgentCreate,
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
    ) -> AgentRead:
        self._ensure_caller_may_access(owner_user_sso, caller)
        try:
            configurations = AgentConfigurations.model_validate(body.configurations)
        except ValidationError as exc:
            raise AppError(
                code="invalid_configuration",
                message="Agent configuration is invalid",
                status_code=422,
                details={"errors": _configuration_errors(exc)},
            ) from None

        stored_configurations, extracted = split_secrets(configurations)
        secrets: list[AgentSecret] = []
        if extracted:
            if cipher is None:
                raise AppError(
                    code="secret_storage_unavailable",
                    message="Credential storage is not configured on this server",
                    status_code=503,
                )
            secrets = [
                AgentSecret(
                    primitive_name=item.primitive_name,
                    field_name=item.field_name,
                    ciphertext=cipher.encrypt(item.value),
                )
                for item in extracted
            ]
        agent = Agent(
            title=body.title,
            system_prompt=body.system_prompt,
            configurations=stored_configurations,
            owner_user_sso=caller.user_sso,
        )
        created = await self._repository.create(agent, secrets)
        return AgentRead.model_validate(created)


def _configuration_errors(exc: ValidationError) -> list[dict[str, str]]:
    """Field path and message only: submitted values (possibly credentials) are not echoed."""
    return [
        {
            "field": ".".join(["configurations", *(str(part) for part in err["loc"])]),
            "message": err["msg"],
        }
        for err in exc.errors()
    ]
