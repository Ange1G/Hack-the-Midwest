import uuid
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import offset_for_page
from app.domains.webhooks.models import Webhook


class WebhookRepository(Protocol):
    async def create(self, webhook: Webhook) -> Webhook: ...

    async def get_by_id(self, webhook_id: uuid.UUID) -> Webhook | None: ...

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Webhook], int]: ...

    async def delete_owned(self, owner_user_sso: str, webhook_id: uuid.UUID) -> bool: ...


class SqlAlchemyWebhookRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, webhook: Webhook) -> Webhook:
        self._session.add(webhook)
        await self._session.commit()
        await self._session.refresh(webhook)
        return webhook

    async def get_by_id(self, webhook_id: uuid.UUID) -> Webhook | None:
        result = await self._session.execute(select(Webhook).where(Webhook.id == webhook_id))
        return result.scalar_one_or_none()

    async def list_by_owner(
        self, owner_user_sso: str, *, page: int, page_size: int
    ) -> tuple[list[Webhook], int]:
        total = await self._session.scalar(
            select(func.count())
            .select_from(Webhook)
            .where(Webhook.owner_user_sso == owner_user_sso)
        )
        result = await self._session.execute(
            select(Webhook)
            .where(Webhook.owner_user_sso == owner_user_sso)
            .order_by(Webhook.created_at.desc(), Webhook.id)
            .offset(offset_for_page(page, page_size))
            .limit(page_size)
        )
        return list(result.scalars().all()), int(total or 0)

    async def delete_owned(self, owner_user_sso: str, webhook_id: uuid.UUID) -> bool:
        webhook = await self.get_by_id(webhook_id)
        if webhook is None or webhook.owner_user_sso != owner_user_sso:
            return False
        await self._session.delete(webhook)
        await self._session.commit()
        return True
