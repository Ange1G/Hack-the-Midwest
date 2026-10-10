import uuid
from collections.abc import Collection
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import offset_for_page
from app.domains.connectors.models import Connector, ConnectorSecret


class ConnectorNameTaken(Exception):
    """The owner already has a connector with this name."""


class ConnectorRepository(Protocol):
    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Connector], int]: ...

    async def create(self, connector: Connector, secrets: list[ConnectorSecret]) -> Connector: ...

    async def types_by_id(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, str]: ...

    async def owned_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list[tuple[Connector, list[ConnectorSecret]]]: ...


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

    async def owned_with_secrets(
        self, owner_user_sso: str, ids: Collection[uuid.UUID]
    ) -> list[tuple[Connector, list[ConnectorSecret]]]:
        """Connectors the owner actually owns, each with its encrypted secret rows."""
        if not ids:
            return []
        result = await self._session.execute(
            select(Connector).where(
                Connector.owner_user_sso == owner_user_sso, Connector.id.in_(ids)
            )
        )
        connectors = list(result.scalars().all())
        if not connectors:
            return []
        secret_rows = await self._session.execute(
            select(ConnectorSecret).where(
                ConnectorSecret.connector_id.in_([c.id for c in connectors])
            )
        )
        by_connector: dict[uuid.UUID, list[ConnectorSecret]] = {c.id: [] for c in connectors}
        for secret in secret_rows.scalars().all():
            by_connector[secret.connector_id].append(secret)
        return [(connector, by_connector[connector.id]) for connector in connectors]
