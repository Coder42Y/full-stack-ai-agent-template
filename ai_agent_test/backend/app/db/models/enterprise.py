"""Enterprise employee-assistant demo data models (WorkMate).

Three tables support the "ask about my own records" scenarios:
- employees        — who's who, department, title, level
- reimbursements   — my expense reimbursements and their status
- leaves           — my leave records (annual / sick / personal)
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Employee(TimestampMixin, Base):
    """Company employee."""

    __tablename__ = "employees"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(50), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)

    reimbursements: Mapped[list["Reimbursement"]] = relationship(
        "Reimbursement", back_populates="employee", cascade="all, delete-orphan"
    )
    leaves: Mapped[list["Leave"]] = relationship(
        "Leave", back_populates="employee", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "level IN ('P1', 'P2', 'P3', 'P4', 'M1', 'M2', 'M3')",
            name="employees_level_valid",
        ),
    )

    def __repr__(self) -> str:
        return f"<Employee(id={self.id}, name={self.name}, department={self.department})>"


class Reimbursement(TimestampMixin, Base):
    """An employee expense reimbursement record."""

    __tablename__ = "reimbursements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    employee: Mapped[Employee] = relationship("Employee", back_populates="reimbursements")

    __table_args__ = (
        CheckConstraint("amount > 0", name="reimbursements_amount_positive"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'paid')",
            name="reimbursements_status_valid",
        ),
        CheckConstraint(
            "category IN ('transport', 'meal', 'lodging', 'office', 'travel', 'other')",
            name="reimbursements_category_valid",
        ),
        Index("ix_reimbursements_employee_submitted_at", "employee_id", "submitted_at"),
    )

    def __repr__(self) -> str:
        return f"<Reimbursement(id={self.id}, employee_id={self.employee_id}, amount={self.amount})>"


class Leave(TimestampMixin, Base):
    """An employee leave record (annual / sick / personal)."""

    __tablename__ = "leaves"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    leave_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    employee: Mapped[Employee] = relationship("Employee", back_populates="leaves")

    __table_args__ = (
        CheckConstraint(
            "leave_type IN ('annual', 'sick', 'personal', 'other')",
            name="leaves_type_valid",
        ),
        CheckConstraint("days > 0", name="leaves_days_positive"),
        CheckConstraint(
            "status IN ('approved', 'pending', 'rejected')",
            name="leaves_status_valid",
        ),
        Index("ix_leaves_employee_start_date", "employee_id", "start_date"),
    )

    def __repr__(self) -> str:
        return f"<Leave(id={self.id}, employee_id={self.employee_id}, leave_type={self.leave_type})>"
