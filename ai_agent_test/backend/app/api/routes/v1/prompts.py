"""Prompt 模板管理 API -- CRUD + 激活.

管理接口需 admin 权限.公开端点仅 GET /prompts/active(返回当前激活模板).

面试讲述点:
- 全栈改造:DB migration → Service/Repository → API → Agent 集成
- activate 操作原子性:同一事务中取消其他 active,设当前 active
- 设计取舍:模板存 DB 而非配置文件,运行时修改 + 权限控制 + 审计追踪
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentAdmin, CurrentUser, PromptTemplateSvc
from app.schemas.prompt_template import (
    PromptTemplateCreate,
    PromptTemplateListResponse,
    PromptTemplateResponse,
    PromptTemplateUpdate,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[PromptTemplateListResponse])
async def list_prompt_templates(
    service: PromptTemplateSvc,
    _admin: CurrentAdmin,
    category: str | None = Query(None, description="按 category 过滤"),
) -> Any:
    """[Admin] 列出所有 Prompt 模板(列表不含 content)."""
    return await service.list_templates(category=category)


@router.post("", response_model=PromptTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_prompt_template(
    data: PromptTemplateCreate,
    service: PromptTemplateSvc,
    admin: CurrentAdmin,
) -> Any:
    """[Admin] 创建 Prompt 模板."""
    return await service.create_template(
        name=data.name,
        description=data.description,
        content=data.content,
        variables=data.variables,
        category=data.category,
        created_by=admin.id,
    )


@router.get("/active", response_model=PromptTemplateResponse)
async def get_active_prompt_template(
    service: PromptTemplateSvc,
    _user: CurrentUser,
    category: str = Query("system", description="模板分类"),
) -> Any:
    """[Auth] 获取当前激活的 Prompt 模板."""
    return await service.get_active_template(category=category)


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_prompt_template(
    template_id: UUID,
    service: PromptTemplateSvc,
    _admin: CurrentAdmin,
) -> Any:
    """[Admin] 获取单个 Prompt 模板详情."""
    return await service.get_template(template_id)


@router.put("/{template_id}", response_model=PromptTemplateResponse)
async def update_prompt_template(
    template_id: UUID,
    data: PromptTemplateUpdate,
    service: PromptTemplateSvc,
    _admin: CurrentAdmin,
) -> Any:
    """[Admin] 更新 Prompt 模板."""
    return await service.update_template(
        template_id,
        name=data.name,
        description=data.description,
        content=data.content,
        variables=data.variables,
        category=data.category,
    )


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt_template(
    template_id: UUID,
    service: PromptTemplateSvc,
    _admin: CurrentAdmin,
) -> None:
    """[Admin] 删除 Prompt 模板(不允许删除激活中的模板)."""
    await service.delete_template(template_id)


@router.post("/{template_id}/activate", response_model=PromptTemplateResponse)
async def activate_prompt_template(
    template_id: UUID,
    service: PromptTemplateSvc,
    _admin: CurrentAdmin,
) -> Any:
    """[Admin] 激活指定模板(原子操作:取消同类其他 active,设此为 active)."""
    return await service.activate_template(template_id)
