import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScheduledExecutionFire(Base):
    """One row per agent + schedule slot so a poll cannot enqueue twice."""

    __tablename__ = "scheduled_execution_fires"
    __table_args__ = (
        UniqueConstraint("agent_id", "slot_key", name="uq_scheduled_execution_fires_slot"),
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
    slot_key: Mapped[str] = mapped_column(String(32), nullable=False)
    fired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
