"""Add nonces table for wallet authentication.

Revision ID: c_add_nonces_table
Revises: b_add_documents_table
Create Date: 2026-02-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c_add_nonces_table"
down_revision: Union[str, Sequence[str], None] = "b_add_documents_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create nonces table for wallet authentication."""
    op.create_table(
        "nonces",
        sa.Column("wallet_address", sa.String(length=255), primary_key=True, nullable=False),
        sa.Column("nonce", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.String(length=50), nullable=False),
    )


def downgrade() -> None:
    """Drop nonces table."""
    op.drop_table("nonces")
