import uuid
from collections.abc import Collection
from typing import Protocol

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.knowledge.models import KnowledgeDocument


class KnowledgeRepository(Protocol):
    async def list_for_connector(self, connector_id: uuid.UUID) -> list[KnowledgeDocument]: ...

    async def usage(self, connector_id: uuid.UUID) -> tuple[int, int]: ...

    async def add(self, document: KnowledgeDocument) -> KnowledgeDocument: ...

    async def delete(self, connector_id: uuid.UUID, document_id: uuid.UUID) -> bool: ...

    async def documents_for_connectors(
        self, owner_user_sso: str, connector_ids: Collection[uuid.UUID]
    ) -> list[KnowledgeDocument]: ...


class SqlAlchemyKnowledgeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_connector(self, connector_id: uuid.UUID) -> list[KnowledgeDocument]:
        result = await self._session.execute(
            select(KnowledgeDocument)
            .where(KnowledgeDocument.connector_id == connector_id)
            .order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id)
        )
        return list(result.scalars().all())

    async def usage(self, connector_id: uuid.UUID) -> tuple[int, int]:
        """(document count, total body bytes) on one connector."""
        row = (
            await self._session.execute(
                select(
                    func.count(KnowledgeDocument.id),
                    func.coalesce(func.sum(KnowledgeDocument.size_bytes), 0),
                ).where(KnowledgeDocument.connector_id == connector_id)
            )
        ).one()
        return int(row[0]), int(row[1])

    async def add(self, document: KnowledgeDocument) -> KnowledgeDocument:
        self._session.add(document)
        await self._session.commit()
        await self._session.refresh(document)
        return document

    async def delete(self, connector_id: uuid.UUID, document_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(KnowledgeDocument).where(
                KnowledgeDocument.connector_id == connector_id,
                KnowledgeDocument.id == document_id,
            )
        )
        await self._session.commit()
        return bool(result.rowcount)

    async def documents_for_connectors(
        self, owner_user_sso: str, connector_ids: Collection[uuid.UUID]
    ) -> list[KnowledgeDocument]:
        """Documents on the owner's connectors among `connector_ids`, oldest first."""
        if not connector_ids:
            return []
        result = await self._session.execute(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.owner_user_sso == owner_user_sso,
                KnowledgeDocument.connector_id.in_(connector_ids),
            )
            .order_by(KnowledgeDocument.created_at, KnowledgeDocument.id)
        )
        return list(result.scalars().all())
