"""add_change_requests

Revision ID: a8b5c3d7e9f1
Revises: 6d6221c278d9
Create Date: 2026-01-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8b5c3d7e9f1'
down_revision: Union[str, Sequence[str], None] = '6d6221c278d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('change_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('test_collection_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('request_type', sa.String(50), nullable=False),
        sa.Column('question_id', sa.String(64), nullable=True),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('review_comment', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['test_collection_id'], ['test_collections.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ondelete='SET NULL')
    )
    op.create_index('ix_change_requests_id', 'change_requests', ['id'])
    op.create_index('ix_change_requests_test_collection_id', 'change_requests', ['test_collection_id'])
    op.create_index('ix_change_requests_user_id', 'change_requests', ['user_id'])
    op.create_index('ix_change_requests_status', 'change_requests', ['status'])
    op.create_index('ix_change_requests_request_type', 'change_requests', ['request_type'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_change_requests_request_type', table_name='change_requests')
    op.drop_index('ix_change_requests_status', table_name='change_requests')
    op.drop_index('ix_change_requests_user_id', table_name='change_requests')
    op.drop_index('ix_change_requests_test_collection_id', table_name='change_requests')
    op.drop_index('ix_change_requests_id', table_name='change_requests')
    op.drop_table('change_requests')
