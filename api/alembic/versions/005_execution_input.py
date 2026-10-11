"""nullable per-run input on agent_executions

Revision ID: 005_execution_input
Revises: 004_agent_executions
Create Date: 2026-10-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_execution_input"
down_revision: Union[str, Sequence[str], None] = "004_agent_executions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_executions", sa.Column("input", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_executions", "input")
