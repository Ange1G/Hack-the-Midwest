"""ordered agent chains and steps

Revision ID: 008_agent_chains
Revises: 007_webhooks
Create Date: 2026-10-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "008_agent_chains"
down_revision: Union[str, Sequence[str], None] = "007_webhooks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_chains",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("owner_user_sso", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("schedule", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_chains_owner_created",
        "agent_chains",
        ["owner_user_sso", "created_at"],
    )
    op.create_table(
        "agent_chain_steps",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("chain_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["chain_id"], ["agent_chains.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chain_id", "position", name="uq_agent_chain_steps_position"),
    )
    op.create_index("ix_agent_chain_steps_chain", "agent_chain_steps", ["chain_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_chain_steps_chain", table_name="agent_chain_steps")
    op.drop_table("agent_chain_steps")
    op.drop_index("ix_agent_chains_owner_created", table_name="agent_chains")
    op.drop_table("agent_chains")
