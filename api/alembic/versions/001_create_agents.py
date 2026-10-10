"""create agents table

Revision ID: 001_create_agents
Revises:
Create Date: 2026-10-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001_create_agents"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "configurations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("schedule_month", sa.SmallInteger(), nullable=True),
        sa.Column("schedule_day", sa.SmallInteger(), nullable=True),
        sa.Column("schedule_time", sa.Time(), nullable=True),
        sa.Column("owner_user_sso", sa.String(length=255), nullable=False),
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
    op.create_index("ix_agents_owner_user_sso", "agents", ["owner_user_sso"], unique=False)
    op.create_index(
        "ix_agents_owner_created",
        "agents",
        ["owner_user_sso", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_agents_owner_created", table_name="agents")
    op.drop_index("ix_agents_owner_user_sso", table_name="agents")
    op.drop_table("agents")
