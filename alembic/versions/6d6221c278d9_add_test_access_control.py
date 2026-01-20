"""add_test_access_control

Revision ID: 6d6221c278d9
Revises: e7309514da6f
Create Date: 2026-01-19 22:56:51.864989

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6d6221c278d9'
down_revision: Union[str, Sequence[str], None] = 'e7309514da6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('test_collections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('test_id', sa.String(64), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('access_level', sa.String(20), nullable=False, server_default='private'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE')
    )
    op.create_index('ix_test_collections_test_id', 'test_collections', ['test_id'], unique=True)
    op.create_index('ix_test_collections_owner_id', 'test_collections', ['owner_id'])

    op.create_table('test_shares',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('test_collection_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('shared_by', sa.Integer(), nullable=True),
        sa.Column('shared_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['test_collection_id'], ['test_collections.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shared_by'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('test_collection_id', 'user_id', name='uq_test_user_share')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('test_shares')
    op.drop_index('ix_test_collections_owner_id', table_name='test_collections')
    op.drop_index('ix_test_collections_test_id', table_name='test_collections')
    op.drop_table('test_collections')
