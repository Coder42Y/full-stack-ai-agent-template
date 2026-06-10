"""Prompt template repository — 纯函数式数据库操作。"""

import json
import logging
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.prompt_template import PromptTemplate

logger = logging.getLogger(__name__)


def _parse_variables(value: str | None) -> list[str]:
    """安全解析 variables JSON 字段。"""
    if not value:
        return []
    try:
        result = json.loads(value)
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        logger.warning(f"Invalid variables JSON: {value!r}")
        return []


async def get_by_id(db: AsyncSession, template_id: UUID) -> PromptTemplate | None:
    stmt = select(PromptTemplate).where(PromptTemplate.id == template_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_or_raise(db: AsyncSession, template_id: UUID) -> PromptTemplate:
    template = await get_by_id(db, template_id)
    if not template:
        raise NotFoundError(message=f"Prompt template '{template_id}' not found")
    return template


async def list_all(
    db: AsyncSession,
    category: str | None = None,
) -> list[PromptTemplate]:
    stmt = select(PromptTemplate).order_by(PromptTemplate.updated_at.desc())
    if category:
        stmt = stmt.where(PromptTemplate.category == category)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_active(db: AsyncSession, category: str = "system") -> PromptTemplate | None:
    """获取指定 category 的激活模板。"""
    stmt = select(PromptTemplate).where(
        PromptTemplate.is_active.is_(True),
        PromptTemplate.category == category,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    name: str,
    description: str = "",
    content: str,
    variables: list[str] | None = None,
    category: str = "system",
    created_by: UUID | None = None,
) -> PromptTemplate:
    template = PromptTemplate(
        name=name,
        description=description,
        content=content,
        variables=json.dumps(variables or []),
        category=category,
        created_by=created_by,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


async def update_template(
    db: AsyncSession,
    template: PromptTemplate,
    *,
    name: str | None = None,
    description: str | None = None,
    content: str | None = None,
    variables: list[str] | None = None,
    category: str | None = None,
) -> PromptTemplate:
    if name is not None:
        template.name = name
    if description is not None:
        template.description = description
    if content is not None:
        template.content = content
    if variables is not None:
        template.variables = json.dumps(variables)
    if category is not None:
        template.category = category
    await db.flush()
    await db.refresh(template)
    return template


async def delete_template(db: AsyncSession, template: PromptTemplate) -> None:
    await db.delete(template)
    await db.flush()


async def activate(db: AsyncSession, template: PromptTemplate) -> PromptTemplate:
    """激活模板:取消同类其他 active,再激活当前.在同一个事务中执行."""
    # Step 1: 取消同 category 其他 active
    await db.execute(
        update(PromptTemplate)
        .where(
            PromptTemplate.category == template.category,
            PromptTemplate.id != template.id,
            PromptTemplate.is_active.is_(True),
        )
        .values(is_active=False)
    )
    # Step 2: 激活当前(捕获唯一约束冲突)
    template.is_active = True
    try:
        await db.flush()
    except Exception as exc:
        # 并发 activate 可能触发 partial unique index 冲突
        err_msg = str(exc).lower()
        if "uq_prompt_templates_active_category" in err_msg or "unique" in err_msg:
            # 重新取消其他 active 再重试
            await db.rollback()
            from app.core.exceptions import BadRequestError
            raise BadRequestError(
                message="Concurrent activation conflict. Please retry."
            ) from exc
        raise
    await db.refresh(template)
    return template
