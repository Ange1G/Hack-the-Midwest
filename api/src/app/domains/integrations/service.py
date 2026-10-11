import copy
from typing import Any

from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.exceptions import AppError, NotFoundError
from app.core.secrets import SecretCipher
from app.domains.connectors.schemas import ConnectorRead
from app.domains.connectors.service import ConnectorService
from app.domains.integrations.catalog import (
    AGENT_TEMPLATES,
    INTEGRATIONS,
    INTEGRATIONS_BY_ID,
    AgentTemplate,
    Integration,
)
from app.domains.integrations.schemas import (
    AgentTemplateRead,
    IntegrationInstall,
    IntegrationRead,
)


def list_integrations() -> list[IntegrationRead]:
    return [_integration_read(item) for item in INTEGRATIONS]


def list_agent_templates() -> list[AgentTemplateRead]:
    return [_template_read(item) for item in AGENT_TEMPLATES]


def install_contract(integration: Integration, body: IntegrationInstall) -> dict[str, Any]:
    """Connector create body for this integration, with the API key in its header slot."""
    if integration.credential.required and not body.api_key:
        raise AppError(
            code="api_key_required",
            message=f"{integration.name} needs an API key",
            status_code=422,
            details={"errors": [{"field": "apiKey", "message": "API key is required"}]},
        )
    contract = copy.deepcopy(integration.contract)
    if body.name:
        contract["name"] = body.name
    if body.api_key:
        value = integration.credential.format.format(key=body.api_key)
        contract["credentials"] = {integration.credential.field: value}
    return contract


class IntegrationService:
    def __init__(self, connectors: ConnectorService) -> None:
        self._connectors = connectors

    async def install(
        self,
        owner_user_sso: str,
        integration_id: str,
        body: IntegrationInstall,
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
    ) -> ConnectorRead:
        ensure_caller_owns(owner_user_sso, caller)
        integration = INTEGRATIONS_BY_ID.get(integration_id)
        if integration is None:
            raise NotFoundError("Integration not found")
        return await self._connectors.create_connector(
            owner_user_sso,
            install_contract(integration, body),
            caller=caller,
            cipher=cipher,
        )


def _integration_read(item: Integration) -> IntegrationRead:
    return IntegrationRead(
        id=item.id,
        name=item.name,
        vendor=item.vendor,
        category=item.category,
        description=item.description,
        docs_url=item.docs_url,
        api_key_url=item.api_key_url,
        connector_type=item.connector_type,
        connector_name=str(item.contract["name"]),
        url=item.url,
        api_key_required=item.credential.required,
        tools=list(item.tools),
        default_allowed_tools=list(item.default_allowed_tools),
    )


def _template_read(item: AgentTemplate) -> AgentTemplateRead:
    allowed: dict[str, list[str]] = {}
    for integration_id in item.integrations:
        integration = INTEGRATIONS_BY_ID[integration_id]
        if integration.connector_type != "mcp":
            continue
        tools = item.allowed_tools.get(integration_id, integration.default_allowed_tools)
        allowed[integration_id] = list(tools)
    return AgentTemplateRead(
        id=item.id,
        name=item.name,
        description=item.description,
        title=item.title,
        system_prompt=item.system_prompt,
        integrations=list(item.integrations),
        allowed_tools=allowed,
        memory=item.memory,
        suggested_input=item.suggested_input,
    )
