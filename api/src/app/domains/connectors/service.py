import uuid
from typing import Any

from pydantic import ValidationError

from app.common.pagination import clamp_page_size
from app.common.validation_errors import describe_validation_errors
from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.config import Settings
from app.core.exceptions import AppError, NotFoundError
from app.core.secrets import SecretCipher
from app.domains.agents.repository import AgentRepository
from app.domains.connectors.models import Connector, ConnectorSecret
from app.domains.connectors.repository import ConnectorNameTaken, ConnectorRepository
from app.domains.connectors.schemas import ConnectorRead, ConnectorToolsRead
from app.domains.primitives.registry import (
    CONNECTORS,
    NESTED_TAGS,
    parse_contract,
    split_credentials,
)
from app.worker.bundle import BundleBuildError, DEFAULT_TIMEOUT_MS
from app.worker.mcp_client import McpToolLister, mcp_request_headers

MAX_MCP_LIST_TIMEOUT_MS = 30_000


class ConnectorService:
    def __init__(
        self, repository: ConnectorRepository, agents: AgentRepository | None = None
    ) -> None:
        self._repository = repository
        self._agents = agents

    async def create_connector(
        self,
        owner_user_sso: str,
        body: dict[str, Any],
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
    ) -> ConnectorRead:
        ensure_caller_owns(owner_user_sso, caller)
        try:
            contract = parse_contract(body)
        except ValidationError as exc:
            raise AppError(
                code="invalid_connector",
                message="Connector contract is invalid",
                status_code=422,
                details={
                    "errors": describe_validation_errors(
                        exc, tags=CONNECTORS, nested_tags=NESTED_TAGS, root_field="type"
                    )
                },
            ) from None

        stored_contract, credentials = split_credentials(contract)
        secrets: list[ConnectorSecret] = []
        if credentials:
            if cipher is None:
                raise AppError(
                    code="secret_storage_unavailable",
                    message="Credential storage is not configured on this server",
                    status_code=503,
                )
            secrets = [
                ConnectorSecret(field_name=field, ciphertext=cipher.encrypt(value))
                for field, value in credentials.items()
            ]

        connector = Connector(
            owner_user_sso=caller.user_sso,
            type=stored_contract["type"],
            name=stored_contract["name"],
            contract=stored_contract,
        )
        try:
            created = await self._repository.create(connector, secrets)
        except ConnectorNameTaken:
            raise AppError(
                code="connector_name_taken",
                message=f"You already have a connector named '{connector.name}'",
                status_code=409,
            ) from None
        return ConnectorRead.model_validate(created)

    async def list_connectors(
        self,
        owner_user_sso: str,
        *,
        page: int,
        page_size: int,
        caller: CurrentUser,
        settings: Settings,
    ) -> tuple[list[ConnectorRead], int, int, int]:
        ensure_caller_owns(owner_user_sso, caller)
        bounded_page_size = clamp_page_size(page_size, settings.max_page_size)
        connectors, total_items = await self._repository.list_by_owner(
            owner_user_sso, page=page, page_size=bounded_page_size
        )
        items = [ConnectorRead.model_validate(c) for c in connectors]
        return items, total_items, page, bounded_page_size

    async def delete_connector(
        self,
        owner_user_sso: str,
        connector_id: uuid.UUID,
        *,
        caller: CurrentUser,
    ) -> None:
        ensure_caller_owns(owner_user_sso, caller)
        if self._agents is not None:
            await self._agents.detach_connector(owner_user_sso, connector_id)
        deleted = await self._repository.delete_owned(owner_user_sso, connector_id)
        if not deleted:
            raise NotFoundError("Connector not found")

    async def list_connector_tools(
        self,
        owner_user_sso: str,
        connector_id: uuid.UUID,
        *,
        caller: CurrentUser,
        cipher: SecretCipher | None,
        list_tools: McpToolLister,
    ) -> ConnectorToolsRead:
        ensure_caller_owns(owner_user_sso, caller)
        loaded = await self._repository.get_with_secrets(owner_user_sso, [connector_id])
        if not loaded:
            raise NotFoundError("Connector not found")
        item = loaded[0]
        if item.connector.type != "mcp":
            raise AppError(
                code="connector_not_mcp",
                message="Tool preview is only available for MCP connectors",
                status_code=422,
            )
        decrypted: dict[str, str] = {}
        if item.ciphertexts:
            if cipher is None:
                raise AppError(
                    code="secret_storage_unavailable",
                    message="Credential storage is not configured on this server",
                    status_code=503,
                )
            decrypted = {
                field: cipher.decrypt(value) for field, value in item.ciphertexts.items()
            }
        contract = item.connector.contract or {}
        config = contract.get("config") or {}
        options = contract.get("options") or {}
        url = config.get("URL")
        if not isinstance(url, str) or not url:
            raise AppError(
                code="mcp_unavailable",
                message="MCP connector is missing a URL",
                status_code=502,
            )
        timeout_ms = options.get("timeout") or DEFAULT_TIMEOUT_MS
        timeout_s = min(max(int(timeout_ms), 100), MAX_MCP_LIST_TIMEOUT_MS) / 1000
        try:
            tools = await list_tools(url, mcp_request_headers(decrypted), timeout_s)
        except BundleBuildError as exc:
            raise AppError(
                code=exc.code,
                message=exc.message,
                status_code=502,
            ) from exc
        return ConnectorToolsRead(
            connector_id=item.connector.id,
            type="mcp",
            tools=tools,
        )
