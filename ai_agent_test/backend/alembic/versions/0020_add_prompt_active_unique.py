"""Add partial unique index for active prompt templates.

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-09

Ensures at most one is_active=true row per category at the database level.
Cleans up any existing duplicates before creating the index.
"""

from alembic import op

revision = "0020_add_prompt_active_unique"
down_revision = "0019_add_prompt_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: 清理已有的重复 active 数据
    # 使用 row_number() 确保即使 created_at 相同也能确定性地保留一条
    op.execute(
        """
        DELETE FROM prompt_templates
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY category
                           ORDER BY created_at DESC, id DESC
                       ) AS rn
                FROM prompt_templates
                WHERE is_active = true
            ) sub
            WHERE rn > 1
        );
        """
    )
    # Step 2: 创建 partial unique index
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_templates_active_category
        ON prompt_templates (category)
        WHERE is_active = true;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS uq_prompt_templates_active_category;
        """
    )
