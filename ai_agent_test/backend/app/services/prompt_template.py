"""Prompt template service -- 业务逻辑层."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.prompt_template import PromptTemplate
from app.repositories import prompt_template as prompt_template_repo

logger = logging.getLogger(__name__)


class PromptTemplateService:
    """Prompt 模板管理 Service."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_templates(
        self, category: str | None = None
    ) -> list[dict]:
        """列出模板(不含 content,节省带宽)."""
        templates = await prompt_template_repo.list_all(self.db, category=category)
        return [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "is_active": t.is_active,
                "category": t.category,
                "variables": prompt_template_repo._parse_variables(t.variables),
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            for t in templates
        ]

    async def create_template(
        self,
        *,
        name: str,
        description: str = "",
        content: str,
        variables: list[str] | None = None,
        category: str = "system",
        created_by: UUID | None = None,
    ) -> dict:
        """创建模板."""
        template = await prompt_template_repo.create(
            self.db,
            name=name,
            description=description,
            content=content,
            variables=variables,
            category=category,
            created_by=created_by,
        )
        return self._to_response(template)

    async def get_template(self, template_id: UUID) -> dict:
        """获取模板详情."""
        template = await prompt_template_repo.get_or_raise(self.db, template_id)
        return self._to_response(template)

    async def update_template(
        self,
        template_id: UUID,
        *,
        name: str | None = None,
        description: str | None = None,
        content: str | None = None,
        variables: list[str] | None = None,
        category: str | None = None,
    ) -> dict:
        """更新模板."""
        template = await prompt_template_repo.get_or_raise(self.db, template_id)
        template = await prompt_template_repo.update_template(
            self.db,
            template,
            name=name,
            description=description,
            content=content,
            variables=variables,
            category=category,
        )
        return self._to_response(template)

    async def delete_template(self, template_id: UUID) -> None:
        """删除模板.不允许删除激活中的模板."""
        template = await prompt_template_repo.get_or_raise(self.db, template_id)
        if template.is_active:
            from app.core.exceptions import BadRequestError
            raise BadRequestError(
                message="Cannot delete an active prompt template. Activate another template first."
            )
        await prompt_template_repo.delete_template(self.db, template)

    async def activate_template(self, template_id: UUID) -> dict:
        """激活模板(原子操作)."""
        template = await prompt_template_repo.get_or_raise(self.db, template_id)
        template = await prompt_template_repo.activate(self.db, template)
        return self._to_response(template)

    async def get_active_template(self, category: str = "system") -> dict:
        """获取激活模板."""
        template = await prompt_template_repo.get_active(self.db, category)
        if not template:
            raise NotFoundError(
                message=f"No active prompt template for category '{category}'"
            )
        return self._to_response(template)

    async def get_active_prompt_text(self, category: str = "system") -> str | None:
        """获取激活模板的 content 文本(供 Agent 内部调用,不抛异常)."""
        try:
            template = await prompt_template_repo.get_active(self.db, category)
            if not template:
                return None
            prompt = template.content
            # 变量替换
            variables = prompt_template_repo._parse_variables(template.variables)
            for var in variables:
                prompt = prompt.replace("{{" + var + "}}", _get_variable_value(var))
            return prompt
        except Exception as e:
            logger.warning(f"Failed to load active prompt from DB: {e}")
            return None

    @staticmethod
    def _to_response(t: PromptTemplate) -> dict:
        return {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "content": t.content,
            "variables": prompt_template_repo._parse_variables(t.variables),
            "is_active": t.is_active,
            "category": t.category,
            "created_by": t.created_by,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }


def _get_variable_value(var_name: str) -> str:
    """解析模板变量的值."""
    from datetime import datetime

    variable_map = {
        "date": lambda: datetime.now().strftime("%Y-%m-%d"),
        "time": lambda: datetime.now().strftime("%H:%M:%S"),
        "datetime": lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    getter = variable_map.get(var_name)
    return getter() if getter else f"<{var_name}>"
