"""webhook chain targets and scheduled chain fire dedupe

Revision ID: 010_webhook_chain_targets
Revises: 009_chain_runs
Create Date: 2026-10-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "010_webhook_chain_targets"
down_revision: Union[str, Sequence[str], None] = "009_chain_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "webhooks",
        sa.Column(
            "target_type",
            sa.String(length=16),
            server_default="agent",
            nullable=False,
        ),
    )
    op.alter_column("webhooks", "target_agent_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column(
        "webhooks",
        sa.Column("target_chain_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_webhooks_target_chain_id",
        "webhooks",
        "agent_chains",
        ["target_chain_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_webhooks_one_target",
        "webhooks",
        "(target_type = 'agent' AND target_agent_id IS NOT NULL AND target_chain_id IS NULL) "
        "OR (target_type = 'chain' AND target_chain_id IS NOT NULL AND target_agent_id IS NULL)",
    )

    op.create_table(
        "scheduled_chain_fires",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("chain_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slot_key", sa.String(length=32), nullable=False),
        sa.Column(
            "fired_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["chain_id"], ["agent_chains.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chain_id", "slot_key", name="uq_scheduled_chain_fires_slot"),
    )


def downgrade() -> None:
    op.drop_table("scheduled_chain_fires")
    op.drop_constraint("ck_webhooks_one_target", "webhooks", type_="check")
    op.drop_constraint("fk_webhooks_target_chain_id", "webhooks", type_="foreignkey")
    op.drop_column("webhooks", "target_chain_id")
    op.alter_column(
        "webhooks", "target_agent_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False
    )
    op.drop_column("webhooks", "target_type")
