import uuid
from collections.abc import Collection
from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import offset_for_page
from app.domains.connectors.models import Connector, ConnectorSecret


class ConnectorNameTaken(Exception):
    """The owner already has a connector with this name."""


@dataclass(frozen=True)
class ConnectorWithSecrets:
    """A connector and its encrypted credentials, for code that executes connectors."""

    connector: Connector
    ciphertexts: dict[str, str] = field(repr=False)  # field name -> Fernet ciphertext


class ConnectorRepository(Protocol):
    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Connector], int]: ...

    async def create(self, connector: Connector, secrets: list[ConnectorSecret]) -> Connector: ...

    async def types_by_id(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, str]: ...

    async def get_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list[ConnectorWithSecrets]: ...

    async def delete_owned(
        self, owner_user_sso: str, connector_id: uuid.UUID
    ) -> bool: ...


class SqlAlchemyConnectorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Connector], int]:
        total = await self._session.scalar(
            select(func.count())
            .select_from(Connector)
            .where(Connector.owner_user_sso == owner_user_sso)
        )
        result = await self._session.execute(
            select(Connector)
            .where(Connector.owner_user_sso == owner_user_sso)
            .order_by(Connector.created_at.desc(), Connector.id)
            .offset(offset_for_page(page, page_size))
            .limit(page_size)
        )
        return list(result.scalars().all()), int(total or 0)

    async def create(self, connector: Connector, secrets: list[ConnectorSecret]) -> Connector:
        """Persist a connector and its encrypted credentials in one transaction."""
        self._session.add(connector)
        try:
            await self._session.flush()  # assigns connector.id; enforces unique name
        except IntegrityError as exc:
            await self._session.rollback()
            if "uq_connectors_owner_name" in str(exc.orig):
                raise ConnectorNameTaken(connector.name) from exc
            raise
        for secret in secrets:
            secret.connector_id = connector.id
            self._session.add(secret)
        await self._session.commit()
        await self._session.refresh(connector)  # load server-side timestamps
        return connector

    async def types_by_id(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        """Types of the given connectors that belong to this owner; others are absent."""
        if not ids:
            return {}
        result = await self._session.execute(
            select(Connector.id, Connector.type).where(
                Connector.owner_user_sso == owner_user_sso, Connector.id.in_(ids)
            )
        )
        return {row.id: row.type for row in result}

    async def get_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list[ConnectorWithSecrets]:
        """The owner's connectors among `ids` with their ciphertexts; others are absent."""
        if not ids:
            return []
        connectors = list(
            (
                await self._session.execute(
                    select(Connector)
                    .where(Connector.owner_user_sso == owner_user_sso, Connector.id.in_(ids))
                    .order_by(Connector.name)
                )
            )
            .scalars()
            .all()
        )
        if not connectors:
            return []
        rows = await self._session.execute(
            select(ConnectorSecret).where(
                ConnectorSecret.connector_id.in_([c.id for c in connectors])
            )
        )
        ciphertexts: dict[uuid.UUID, dict[str, str]] = {}
        for secret in rows.scalars():
            ciphertexts.setdefault(secret.connector_id, {})[secret.field_name] = secret.ciphertext
        return [ConnectorWithSecrets(c, ciphertexts.get(c.id, {})) for c in connectors]

    async def delete_owned(self, owner_user_sso: str, connector_id: uuid.UUID) -> bool:
        """Delete a connector that belongs to owner_user_sso. Returns False if not found or wrong owner."""
        result = await self._session.execute(
            select(Connector).where(Connector.id == connector_id)
        )
        connector = result.scalar_one_or_none()
        if connector is None or connector.owner_user_sso != owner_user_sso:
            return False
        await self._session.delete(connector)
        await self._session.commit()
        return True
