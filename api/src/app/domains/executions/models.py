import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ExecutionStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    TIMED_OUT = "timed_out"


TERMINAL_STATUSES = frozenset(
    {
        ExecutionStatus.SUCCEEDED,
        ExecutionStatus.FAILED,
        ExecutionStatus.TIMED_OUT,
    }
)


class AgentExecution(Base):
    __tablename__ = "agent_executions"
    __table_args__ = (
        Index("ix_agent_executions_owner_created", "owner_user_sso", "created_at"),
        Index("ix_agent_executions_status_created", "status", "created_at"),
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
    owner_user_sso: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    callback_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    runner_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
