"""Rename file_path to nova_cid in documents table.

Revision ID: d_rename_file_path_to_nova_cid
Revises: c_add_nonces_table
Create Date: 2026-02-13
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d_rename_file_path_to_nova_cid"
down_revision: Union[str, Sequence[str], None] = "c_add_nonces_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename file_path column to nova_cid for Nova IPFS storage."""
    op.alter_column(
        "documents",
        "file_path",
        new_column_name="nova_cid",
    )


def downgrade() -> None:
    """Revert nova_cid back to file_path."""
    op.alter_column(
        "documents",
        "nova_cid",
        new_column_name="file_path",
    )
