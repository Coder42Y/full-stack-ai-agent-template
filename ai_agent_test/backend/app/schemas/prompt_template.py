"""Prompt 模板的 Pydantic Schema."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PromptTemplateCreate(BaseModel):
    """创建 Prompt 模板."""

    name: str = Field(..., min_length=1, max_length=100, description="模板名称")
    description: str = Field(default="", max_length=2000, description="模板描述")
    content: str = Field(..., min_length=1, description="模板内容, 支持 {{variable}} 占位符")
    variables: list[str] = Field(default_factory=list, description="变量列表")
    category: str = Field(default="system", max_length=50, description="分类: system / rag / tool")


class PromptTemplateUpdate(BaseModel):
    """更新 Prompt 模板."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    content: str | None = Field(default=None, min_length=1)
    variables: list[str] | None = Field(default=None)
    category: str | None = Field(default=None, max_length=50)


class PromptTemplateResponse(BaseModel):
    """Prompt 模板响应."""

    id: UUID
    name: str
    description: str
    content: str
    variables: list[str]
    is_active: bool
    category: str
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class PromptTemplateListResponse(BaseModel):
    """Prompt 模板列表项(不含 content,用于列表页)."""

    id: UUID
    name: str
    description: str
    is_active: bool
    category: str
    variables: list[str]
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
