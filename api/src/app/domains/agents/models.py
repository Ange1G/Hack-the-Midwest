import uuid
from datetime import datetime, time

from sqlalchemy import DateTime, Index, SmallInteger, String, Text, Time, func
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (
        Index("ix_agents_owner_user_sso", "owner_user_sso"),
        Index("ix_agents_owner_created", "owner_user_sso", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    configurations: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    schedule_month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    schedule_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    schedule_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    owner_user_sso: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AgentSecret(Base):
    """A credential from an agent's HTTP contract, encrypted at rest.

    Kept out of `agents.configurations` so list and detail responses can never
    include it. The worker decrypts it only when executing the contract.
    """

    __tablename__ = "agent_secrets"
    __table_args__ = (
        UniqueConstraint(
            "agent_id",
            "primitive_name",
            "field_name",
            name="uq_agent_secrets_agent_primitive_field",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
    )
    primitive_name: Mapped[str] = mapped_column(String(64), nullable=False)
    field_name: Mapped[str] = mapped_column(String(64), nullable=False)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
