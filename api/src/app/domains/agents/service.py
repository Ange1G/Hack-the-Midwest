from app.core.auth import CurrentUser
from app.common.pagination import clamp_page_size, total_pages
from app.core.config import Settings
from app.core.exceptions import ForbiddenError
import uuid
from collections.abc import Collection
from typing import Protocol

from pydantic import ValidationError

from app.common.validation_errors import describe_validation_errors
from app.core.exceptions import AppError, NotFoundError
from app.domains.agents.configurations import AgentConfigurations
from app.domains.agents.models import Agent
from app.domains.agents.schemas import AgentCreate, AgentUpdate
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
        connectors: "ConnectorLookup",
    ) -> AgentRead:
        self._ensure_caller_may_access(owner_user_sso, caller)
        try:
            configurations = AgentConfigurations.model_validate(body.configurations)
        except ValidationError as exc:
            raise _invalid_configuration(
                describe_validation_errors(exc, prefix="configurations")
            ) from None

        errors = await _connector_reference_errors(configurations, caller.user_sso, connectors)
        errors += await self._delegate_errors(configurations, caller.user_sso, agent_id=None)
        if errors:
            raise _invalid_configuration(errors)

        agent = Agent(
            title=body.title,
            system_prompt=body.system_prompt,
            configurations=configurations.model_dump(mode="json", by_alias=True, exclude_none=True),
            owner_user_sso=caller.user_sso,
        )
        created = await self._repository.create(agent)
        return AgentRead.model_validate(created)

    async def update_agent(
        self,
        owner_user_sso: str,
        agent_id: uuid.UUID,
        body: AgentUpdate,
        *,
        caller: CurrentUser,
        connectors: "ConnectorLookup",
    ) -> AgentRead:
        self._ensure_caller_may_access(owner_user_sso, caller)
        agent = await self._repository.get_owned(owner_user_sso, agent_id)
        if agent is None:
            raise NotFoundError("Agent not found")
        if body.title is None and body.system_prompt is None and body.configurations is None:
            raise AppError(
                code="validation_error",
                message="At least one of title, systemPrompt, or configurations is required",
                status_code=422,
            )

        if body.title is not None:
            agent.title = body.title
        if body.system_prompt is not None:
            agent.system_prompt = body.system_prompt
        if body.configurations is not None:
            try:
                configurations = AgentConfigurations.model_validate(body.configurations)
            except ValidationError as exc:
                raise _invalid_configuration(
                    describe_validation_errors(exc, prefix="configurations")
                ) from None
            errors = await _connector_reference_errors(
                configurations, caller.user_sso, connectors
            )
            errors += await self._delegate_errors(
                configurations, caller.user_sso, agent_id=agent.id
            )
            if errors:
                raise _invalid_configuration(errors)
            agent.configurations = configurations.model_dump(
                mode="json", by_alias=True, exclude_none=True
            )

        updated = await self._repository.save(agent)
        return AgentRead.model_validate(updated)

    async def get_agent(
        self,
        owner_user_sso: str,
        agent_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> AgentRead:
        self._ensure_caller_may_access(owner_user_sso, caller)
        agent = await self._repository.get_owned(owner_user_sso, agent_id)
        if agent is None:
            raise NotFoundError("Agent not found")
        return AgentRead.model_validate(agent)

    async def _delegate_errors(
        self,
        configurations: AgentConfigurations,
        owner_user_sso: str,
        *,
        agent_id: uuid.UUID | None,
    ) -> list[dict[str, str]]:
        errors = []
        for index, delegate_id in enumerate(configurations.delegates):
            field = f"configurations.delegates.{index}"
            if delegate_id == agent_id:
                errors.append({"field": field, "message": "An agent cannot delegate to itself"})
            elif await self._repository.get_owned(owner_user_sso, delegate_id) is None:
                # Same answer for "missing" and "someone else's", so IDs can't be probed.
                errors.append({"field": field, "message": "Agent not found"})
        return errors


class ConnectorLookup(Protocol):
    async def types_by_id(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, str]: ...


async def _connector_reference_errors(
    configurations: AgentConfigurations, owner_user_sso: str, connectors: ConnectorLookup
) -> list[dict[str, str]]:
    """Every referenced connector must belong to the owner and be used as its type allows."""
    if not configurations.primitives:
        return []
    owned_types = await connectors.types_by_id(owner_user_sso, configurations.primitives.keys())
    errors = []
    for connector_id, reference in configurations.primitives.items():
        field = f"configurations.primitives.{connector_id}"
        connector_type = owned_types.get(connector_id)
        if connector_type is None:
            # Same answer for "missing" and "someone else's", so IDs can't be probed.
            message = "Connector not found"
        elif connector_type == "mcp" and reference.allowed_tools is None:
            message = "MCP connectors need allowedTools listing the tools this agent may call"
        elif connector_type != "mcp" and reference.allowed_tools is not None:
            message = "allowedTools applies only to MCP connectors"
        else:
            continue
        errors.append({"field": field, "message": message})
    return errors


def _invalid_configuration(errors: list[dict[str, str]]) -> AppError:
    return AppError(
        code="invalid_configuration",
        message="Agent configuration is invalid",
        status_code=422,
        details={"errors": errors},
    )
