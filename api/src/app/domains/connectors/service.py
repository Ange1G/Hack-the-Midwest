from typing import Any

from pydantic import ValidationError

from app.common.pagination import clamp_page_size
from app.common.validation_errors import describe_validation_errors
from app.core.auth import CurrentUser, ensure_caller_owns
from app.core.config import Settings
from app.core.exceptions import AppError
from app.core.secrets import SecretCipher
from app.domains.connectors.models import Connector, ConnectorSecret
from app.domains.connectors.repository import ConnectorNameTaken, ConnectorRepository
from app.domains.connectors.schemas import ConnectorRead
from app.domains.primitives.registry import (
    CONNECTORS,
    NESTED_TAGS,
    parse_contract,
    split_credentials,
)


class ConnectorService:
    def __init__(self, repository: ConnectorRepository) -> None:
        self._repository = repository

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
