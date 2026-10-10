"""connectors and connector_secrets; drop agent_secrets

Credentials now belong to user-owned connectors that agents reference, instead of
being stored per agent.

Revision ID: 003_connectors
Revises: 002_create_agent_secrets
Create Date: 2026-10-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_connectors"
down_revision: Union[str, Sequence[str], None] = "002_create_agent_secrets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamp(name: str) -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        server_default=sa.text("gen_random_uuid()"),
        nullable=False,
    )


def upgrade() -> None:
    # agent_secrets only ever held credentials of inline agent contracts, which this
    # change removes; no production data existed in it.
    op.drop_table("agent_secrets")

    op.create_table(
        "connectors",
        _uuid_pk(),
        sa.Column("owner_user_sso", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("contract", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_user_sso", "name", name="uq_connectors_owner_name"),
    )
    op.create_index(
        "ix_connectors_owner_created", "connectors", ["owner_user_sso", "created_at"]
    )

    op.create_table(
        "connector_secrets",
        _uuid_pk(),
        sa.Column("connector_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field_name", sa.String(length=64), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        _timestamp("created_at"),
        sa.ForeignKeyConstraint(["connector_id"], ["connectors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "connector_id", "field_name", name="uq_connector_secrets_connector_field"
        ),
    )


def downgrade() -> None:
    op.drop_table("connector_secrets")
    op.drop_index("ix_connectors_owner_created", table_name="connectors")
    op.drop_table("connectors")

    op.create_table(
        "agent_secrets",
        _uuid_pk(),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("primitive_name", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=64), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        _timestamp("created_at"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "agent_id",
            "primitive_name",
            "field_name",
            name="uq_agent_secrets_agent_primitive_field",
        ),
    )
