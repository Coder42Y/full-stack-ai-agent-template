"""Create enterprise employee-assistant demo tables (WorkMate).

Revision ID: 0022_create_enterprise_tables
Revises: 0021_create_mobility_tables
Create Date: 2026-08-14
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0022_create_enterprise_tables"
down_revision = "0021_create_mobility_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "employees",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("department", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=50), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("hire_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "level IN ('P1', 'P2', 'P3', 'P4', 'M1', 'M2', 'M3')",
            name="employees_level_valid",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_employees_department", "employees", ["department"], unique=False)

    op.create_table(
        "reimbursements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column(
            "submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount > 0", name="reimbursements_amount_positive"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'paid')",
            name="reimbursements_status_valid",
        ),
        sa.CheckConstraint(
            "category IN ('transport', 'meal', 'lodging', 'office', 'travel', 'other')",
            name="reimbursements_category_valid",
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reimbursements_employee_submitted_at",
        "reimbursements",
        ["employee_id", "submitted_at"],
        unique=False,
    )
    op.create_index("ix_reimbursements_category", "reimbursements", ["category"], unique=False)
    op.create_index("ix_reimbursements_status", "reimbursements", ["status"], unique=False)
    op.create_index(
        "ix_reimbursements_submitted_at", "reimbursements", ["submitted_at"], unique=False
    )

    op.create_table(
        "leaves",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type", sa.String(length=20), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("days", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "leave_type IN ('annual', 'sick', 'personal', 'other')",
            name="leaves_type_valid",
        ),
        sa.CheckConstraint("days > 0", name="leaves_days_positive"),
        sa.CheckConstraint(
            "status IN ('approved', 'pending', 'rejected')",
            name="leaves_status_valid",
        ),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_leaves_employee_start_date", "leaves", ["employee_id", "start_date"], unique=False
    )
    op.create_index("ix_leaves_leave_type", "leaves", ["leave_type"], unique=False)
    op.create_index("ix_leaves_status", "leaves", ["status"], unique=False)


def downgrade() -> None:
    op.drop_table("leaves")
    op.drop_table("reimbursements")
    op.drop_table("employees")
