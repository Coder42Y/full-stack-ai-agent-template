"""Prompt 模板数据模型.

支持将 system prompt 从硬编码改为数据库动态管理.
字段设计:
- content: 模板内容,支持 {{variable}} 占位符
- variables: JSON 数组,如 ["topic", "language"]
- is_active: 唯一激活标记,激活时自动取消其他模板
- category: 分类标签(system / rag / tool)

面试讲述点:
- 为什么存数据库不存配置文件?运行时修改,多用户权限,审计日志
- is_active 唯一约束保证同一 category 只有一个激活模板
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PromptTemplate(Base):
    """Prompt 模板模型."""

    __tablename__ = "prompt_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, server_default="", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[str] = mapped_column(Text, server_default="[]", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), server_default="system", nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    def __repr__(self) -> str:
        return f"<PromptTemplate(id={self.id}, name={self.name}, active={self.is_active})>"
