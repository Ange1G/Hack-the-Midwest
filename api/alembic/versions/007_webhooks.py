"""HMAC webhook triggers for agent executions

Revision ID: 007_webhooks
Revises: 006_scheduled_execution_fires
Create Date: 2026-10-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "007_webhooks"
down_revision: Union[str, Sequence[str], None] = "006_scheduled_execution_fires"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "webhooks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("owner_user_sso", sa.String(length=255), nullable=False),
        sa.Column("target_agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("secret_ciphertext", sa.Text(), nullable=False),
        sa.Column(
            "disabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["target_agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_webhooks_owner_created",
        "webhooks",
        ["owner_user_sso", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_webhooks_owner_created", table_name="webhooks")
    op.drop_table("webhooks")
