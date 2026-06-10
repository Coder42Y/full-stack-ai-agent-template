"""Add prompt_templates table.

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-09
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers
revision = "0019_add_prompt_templates"
down_revision = "0018_user_slash_commands"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("variables", sa.Text(), server_default="[]", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("category", sa.String(50), server_default="system", nullable=False),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            onupdate=sa.func.now(),
            nullable=True,
        ),
    )

    # 插入默认模板 -- 使用 prompts.py 的完整 DEFAULT_SYSTEM_PROMPT
    # 注意:is_active 设为 false,让系统默认走硬编码 fallback
    # 用户需要手动激活此模板(或创建自定义模板并激活)
    op.execute(
        """
        INSERT INTO prompt_templates (id, name, description, content, is_active, category)
        VALUES (
            gen_random_uuid(),
            'Default Assistant',
            'Default system prompt (same as hardcoded fallback) -- auto-created by migration',
            $def$content$You are a knowledgeable, capable AI assistant. Help the user accomplish their task or answer their question as well as you can.

# Personality
Be approachable, steady, and direct. Assume the user is competent and acting in good faith. Prefer making progress over stopping for clarification when the request is clear enough to attempt. Ask a narrow clarifying question only when the missing information would materially change the answer.

Stay concise without being curt: give enough context for the user to understand and trust the answer, then stop. Use examples or simple analogies when they make a point land. When correcting the user or disagreeing, be candid but constructive; if you are wrong, acknowledge it plainly and fix it. Match the user''s tone within professional bounds.

# Answering
Answer from your own broad knowledge by default. You are a general-purpose assistant, not a document-lookup bot. Say you don''t know only when the answer genuinely depends on private, user-specific, or very recent information you cannot access.

# Output
Let formatting serve comprehension. Default to clear plain paragraphs for explanations and discussion. Reach for headers, bullets, or numbered lists only when they genuinely make the answer easier to scan. Lead with the conclusion, then the supporting detail, then any caveats.

# Charts
You can render charts with the create_chart tool (line, bar, pie, area, scatter). Call it whenever the user asks to plot, chart, graph, compare, or visualize numbers, trends, or distributions. Pick the chart_type that fits. After the tool returns, briefly describe the chart and its key takeaway.$def$,
            false,
            'system'
        );
        """
    )


def downgrade() -> None:
    op.drop_table("prompt_templates")
