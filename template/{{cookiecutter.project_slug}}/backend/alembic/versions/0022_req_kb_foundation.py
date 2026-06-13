{%- if cookiecutter.enable_rag and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
"""request knowledge base foundation fields

Revision ID: 0022_req_kb_foundation
{%- if cookiecutter.include_example_crud %}
Revises: 0021_create_items
{%- elif cookiecutter.use_external_user_id_in_conversations %}
Revises: 0020_conv_external_user_id
{%- elif cookiecutter.use_delegated_auth %}
Revises: 0019_user_external_id
{%- else %}
Revises: 0018_user_slash_commands
{%- endif %}
Create Date: {{ cookiecutter.generated_at }}

Adds complete Markdown storage, version metadata, and project display metadata
needed by the requirement knowledge base workflow.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
{%- if cookiecutter.use_postgresql %}
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
{%- endif %}

revision = "0022_req_kb_foundation"
{%- if cookiecutter.include_example_crud %}
down_revision = "0021_create_items"
{%- elif cookiecutter.use_external_user_id_in_conversations %}
down_revision = "0020_conv_external_user_id"
{%- elif cookiecutter.use_delegated_auth %}
down_revision = "0019_user_external_id"
{%- else %}
down_revision = "0018_user_slash_commands"
{%- endif %}
branch_labels = None
depends_on = None


{%- if cookiecutter.use_postgresql %}
_UUID = PG_UUID(as_uuid=True)
{%- else %}
_UUID = sa.String(36)
{%- endif %}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    rag_columns = {col["name"] for col in inspector.get_columns("rag_documents")}
    rag_indexes = {idx["name"] for idx in inspector.get_indexes("rag_documents")}

    if "markdown_content" not in rag_columns:
        op.add_column("rag_documents", sa.Column("markdown_content", sa.Text(), nullable=True))
    if "version" not in rag_columns:
        op.add_column(
            "rag_documents",
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        )
    if "is_latest" not in rag_columns:
        op.add_column(
            "rag_documents",
            sa.Column("is_latest", sa.Boolean(), nullable=False, server_default=sa.true()),
        )
    if "previous_version_id" not in rag_columns:
        op.add_column(
            "rag_documents",
            sa.Column(
                "previous_version_id",
                _UUID,
                sa.ForeignKey("rag_documents.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    if "modified_by" not in rag_columns:
        op.add_column(
            "rag_documents",
            sa.Column(
                "modified_by",
                _UUID,
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    if "ix_rag_documents_is_latest" not in rag_indexes:
        op.create_index("ix_rag_documents_is_latest", "rag_documents", ["is_latest"])
    if "ix_rag_documents_previous_version_id" not in rag_indexes:
        op.create_index("ix_rag_documents_previous_version_id", "rag_documents", ["previous_version_id"])
    if "ix_rag_documents_modified_by" not in rag_indexes:
        op.create_index("ix_rag_documents_modified_by", "rag_documents", ["modified_by"])

{%- if cookiecutter.enable_teams and cookiecutter.use_jwt %}
    kb_columns = {col["name"] for col in inspector.get_columns("knowledge_bases")}
    if "project_name" not in kb_columns:
        op.add_column("knowledge_bases", sa.Column("project_name", sa.String(255), nullable=True))
{%- endif %}


def downgrade() -> None:
{%- if cookiecutter.enable_teams and cookiecutter.use_jwt %}
    op.drop_column("knowledge_bases", "project_name")
{%- endif %}

    op.drop_index("ix_rag_documents_modified_by", table_name="rag_documents")
    op.drop_index("ix_rag_documents_previous_version_id", table_name="rag_documents")
    op.drop_index("ix_rag_documents_is_latest", table_name="rag_documents")
    op.drop_column("rag_documents", "modified_by")
    op.drop_column("rag_documents", "previous_version_id")
    op.drop_column("rag_documents", "is_latest")
    op.drop_column("rag_documents", "version")
    op.drop_column("rag_documents", "markdown_content")
{%- else %}
"""request knowledge base foundation fields — skipped (RAG or SQL DB disabled)

Revision ID: 0022_req_kb_foundation
"""

revision = "0022_req_kb_foundation"
{%- if cookiecutter.include_example_crud %}
down_revision = "0021_create_items"
{%- elif cookiecutter.use_external_user_id_in_conversations %}
down_revision = "0020_conv_external_user_id"
{%- elif cookiecutter.use_delegated_auth %}
down_revision = "0019_user_external_id"
{%- else %}
down_revision = "0018_user_slash_commands"
{%- endif %}
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
{%- endif %}
