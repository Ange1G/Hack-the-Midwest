"""agent_executions for async Docker runs

Revision ID: 004_agent_executions
Revises: 003_connectors
Create Date: 2026-10-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004_agent_executions"
down_revision: Union[str, Sequence[str], None] = "003_connectors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_executions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_sso", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("callback_token_hash", sa.String(length=64), nullable=True),
        sa.Column("runner_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_executions_owner_created",
        "agent_executions",
        ["owner_user_sso", "created_at"],
    )
    op.create_index(
        "ix_agent_executions_status_created",
        "agent_executions",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_agent_executions_status_created", table_name="agent_executions")
    op.drop_index("ix_agent_executions_owner_created", table_name="agent_executions")
    op.drop_table("agent_executions")
