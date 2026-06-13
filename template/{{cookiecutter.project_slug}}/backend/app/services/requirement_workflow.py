{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and cookiecutter.use_postgresql %}
"""Requirement workflow helpers for demoable KB MVP flows.

The service prefers a configured LLM for one-sentence intake, clarification
application, and document rewrite. Deterministic fallbacks keep local generated
projects and tests usable when no model endpoint is configured.
"""

from __future__ import annotations

import difflib
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.rag_document import RAGDocument
from app.repositories import rag_document_repo
from app.schemas.rag import (
    RequirementBreakdownItem,
    RequirementBreakdownResponse,
    RequirementChangeResponse,
    RequirementDocumentDiffResponse,
    RequirementDocumentVersionItem,
    RequirementDocumentVersionList,
    RequirementIntakeResponse,
    RequirementNotificationEvent,
)
from app.services.requirement_ai import RequirementAIService


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
_SPACE_RE = re.compile(r"\s+")


def _compact(text: str, *, limit: int = 600) -> str:
    compacted = _SPACE_RE.sub(" ", text).strip()
    if len(compacted) <= limit:
        return compacted
    return compacted[: limit - 3].rstrip() + "..."


def _safe_title(text: str) -> str:
    title = _compact(text, limit=42).strip(" .。")
    return title or "未命名需求"


def _safe_filename(title: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+", "-", title).strip("-")
    return f"{slug or 'requirement'}.md"


def _clarification_questions(description: str) -> list[str]:
    lowered = description.lower()
    questions = [
        "这个需求的目标用户和使用场景是什么?",
        "成功上线的验收标准有哪些?",
        "是否存在地区、权限、费用、兼容性或异常流程约束?",
    ]
    if "海外" in description or "international" in lowered or "country" in lowered:
        questions[0] = "需要支持哪些国家或地区, 地址字段格式是否不同?"
        questions[2] = "海外地址的运费、税费、校验和异常提示规则是什么?"
    return questions


def _markdown_from_description(title: str, description: str) -> tuple[str, list[str]]:
    questions = _clarification_questions(description)
    question_lines = "\n".join(f"- {question}" for question in questions)
    return (
        f"# {title}\n\n"
        "## 原始描述\n\n"
        f"{description.strip()}\n\n"
        "## 待澄清问题\n\n"
        f"{question_lines}\n\n"
        "## 验收草案\n\n"
        "- 产品确认澄清问题后补充完整业务规则。\n"
        "- 开发和测试只能基于本文档原文查询、拆解和提出修改建议。\n",
        questions,
    )


def _append_change(markdown: str, instruction: str) -> str:
    timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    return (
        markdown.rstrip()
        + "\n\n## 变更说明\n\n"
        + f"- {timestamp}: {instruction.strip()}\n"
    )


def _sections(markdown: str) -> list[tuple[str, str]]:
    matches = list(_HEADING_RE.finditer(markdown))
    if not matches:
        return [("全文", markdown)]

    sections: list[tuple[str, str]] = []
    for idx, match in enumerate(matches):
        title = match.group(2).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown)
        body = markdown[start:end].strip()
        if body:
            sections.append((title, body))
    return sections or [("全文", markdown)]


class RequirementWorkflowService:
    """Create, break down, and change requirement Markdown documents."""

    def __init__(
        self,
        db: AsyncSession,
        ai_service: RequirementAIService | None = None,
    ):
        self.db = db
        self.ai_service = ai_service or RequirementAIService()

    async def create_from_text(
        self,
        *,
        kb: Any,
        description: str,
        user_id: UUID,
        organization_id: UUID | None,
        title: str | None = None,
        filename: str | None = None,
    ) -> RequirementIntakeResponse:
        """Create a tracked requirement document from one sentence."""
        doc_title = title or _safe_title(description)
        doc_filename = filename or _safe_filename(doc_title)
        ai_result = None
        ai_error = None
        try:
            ai_result = await self.ai_service.create_from_text(
                title=doc_title,
                description=description,
            )
        except Exception as exc:
            ai_error = str(exc)
            ai_result = None

        if ai_result is not None:
            markdown = ai_result.markdown_content
            questions = ai_result.clarification_questions
        else:
            markdown, questions = _markdown_from_description(doc_title, description)

        doc = await rag_document_repo.create(
            self.db,
            collection_name=kb.collection_name,
            filename=doc_filename,
            filesize=len(markdown.encode("utf-8")),
            filetype="md",
            storage_path="",
            status="done",
            markdown_content=markdown,
            chunk_count=1,
            completed_at=datetime.now(UTC),
            modified_by=user_id,
            organization_id=organization_id,
            knowledge_base_id=kb.id,
        )
        return RequirementIntakeResponse(
            document_id=str(doc.id),
            filename=doc.filename,
            markdown_content=markdown,
            clarification_questions=questions,
            ai_used=ai_result is not None,
            ai_model=self.ai_service.model if ai_result is not None else None,
            ai_error=ai_error,
            notification_event=self._event(
                kb_id=kb.id,
                doc=doc,
                event_type="requirement.created",
                message=f"需求文档 {doc.filename} 已由一句话创建并入库.",
            ),
        )

    async def break_down_document(
        self,
        *,
        kb_id: UUID,
        doc_id: UUID,
        role: str,
    ) -> RequirementBreakdownResponse:
        """Break down a stored Markdown document by sections with source labels."""
        doc = await self._get_doc(kb_id=kb_id, doc_id=doc_id)
        markdown = doc.markdown_content or ""
        ai_error = None
        items: list[RequirementBreakdownItem] = []
        for title, body in _sections(markdown):
            excerpt = _compact(body)
            test_focus = []
            if role == "tester":
                test_focus = [
                    "覆盖正常流程、边界值和异常提示.",
                    "确认需求原文中的权限、地区、费用或状态约束.",
                ]
            items.append(
                RequirementBreakdownItem(
                    title=title,
                    summary=excerpt,
                    source_label=f"{doc.filename} > {title}",
                    excerpt=excerpt,
                    test_focus=test_focus,
                )
            )

        answer_lines = ["需求拆解如下:"]
        for idx, item in enumerate(items, start=1):
            answer_lines.append(f"{idx}. {item.title}: {item.summary}")
            answer_lines.append(f"[来源: {item.source_label}]")
            if item.test_focus:
                answer_lines.append("测试关注: " + " ".join(item.test_focus))

        answer = "\n".join(answer_lines)
        try:
            ai_answer = await self.ai_service.summarize_breakdown(
                role=role,
                filename=doc.filename,
                source_context="\n\n".join(
                    f"[来源: {item.source_label}]\n{item.excerpt}" for item in items
                ),
            )
        except Exception as exc:
            ai_error = str(exc)
            ai_answer = None
        if ai_answer:
            answer = ai_answer

        return RequirementBreakdownResponse(
            document_id=str(doc.id),
            filename=doc.filename,
            answer=answer,
            items=items,
            ai_used=bool(ai_answer),
            ai_model=self.ai_service.model if ai_answer else None,
            ai_error=ai_error,
        )

    async def list_document_versions(
        self,
        *,
        kb_id: UUID,
        doc_id: UUID,
    ) -> RequirementDocumentVersionList:
        """List every version connected to one requirement document."""
        versions = await rag_document_repo.get_version_chain_for_document(
            self.db,
            knowledge_base_id=kb_id,
            document_id=doc_id,
        )
        if not versions:
            raise NotFoundError(
                message="Requirement document not found in this knowledge base",
                details={"kb_id": str(kb_id), "doc_id": str(doc_id)},
            )
        return RequirementDocumentVersionList(
            items=[
                RequirementDocumentVersionItem(
                    document_id=str(version.id),
                    filename=version.filename,
                    version=version.version,
                    status=version.status,
                    is_latest=version.is_latest,
                    previous_version_id=(
                        str(version.previous_version_id)
                        if version.previous_version_id
                        else None
                    ),
                    modified_by=str(version.modified_by) if version.modified_by else None,
                    has_markdown_content=bool(version.markdown_content),
                    created_at=(
                        version.created_at.isoformat()
                        if getattr(version, "created_at", None)
                        else None
                    ),
                    completed_at=(
                        version.completed_at.isoformat()
                        if version.completed_at
                        else None
                    ),
                )
                for version in versions
            ],
            total=len(versions),
        )

    async def diff_document_versions(
        self,
        *,
        kb_id: UUID,
        doc_id: UUID,
        from_version: int | None = None,
        to_version: int | None = None,
    ) -> RequirementDocumentDiffResponse:
        """Return a unified Markdown diff for two versions in the same chain."""
        versions = await rag_document_repo.get_version_chain_for_document(
            self.db,
            knowledge_base_id=kb_id,
            document_id=doc_id,
        )
        if not versions:
            raise NotFoundError(
                message="Requirement document not found in this knowledge base",
                details={"kb_id": str(kb_id), "doc_id": str(doc_id)},
            )

        by_version = {version.version: version for version in versions}
        latest = max(versions, key=lambda version: version.version)
        to_doc = by_version.get(to_version or latest.version)
        if to_doc is None:
            raise NotFoundError(
                message="Target requirement version not found",
                details={"to_version": to_version},
            )

        default_from_version = max(1, to_doc.version - 1)
        from_doc = by_version.get(from_version or default_from_version)
        if from_doc is None:
            raise NotFoundError(
                message="Source requirement version not found",
                details={"from_version": from_version or default_from_version},
            )

        from_lines = (from_doc.markdown_content or "").splitlines()
        to_lines = (to_doc.markdown_content or "").splitlines()
        diff_lines = list(
            difflib.unified_diff(
                from_lines,
                to_lines,
                fromfile=f"{from_doc.filename} v{from_doc.version}",
                tofile=f"{to_doc.filename} v{to_doc.version}",
                lineterm="",
            )
        )
        added = sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++"))
        removed = sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---"))
        if added or removed:
            summary = f"v{from_doc.version} -> v{to_doc.version}: 新增 {added} 行, 删除 {removed} 行."
        else:
            summary = f"v{from_doc.version} -> v{to_doc.version}: 未发现 Markdown 文本差异."

        return RequirementDocumentDiffResponse(
            filename=to_doc.filename,
            from_document_id=str(from_doc.id),
            to_document_id=str(to_doc.id),
            from_version=from_doc.version,
            to_version=to_doc.version,
            summary=summary,
            diff_lines=diff_lines,
        )

    async def change_document(
        self,
        *,
        kb_id: UUID,
        doc_id: UUID,
        instruction: str,
        apply: bool,
        user_id: UUID,
        role: str,
        is_app_admin: bool,
    ) -> RequirementChangeResponse:
        """Record a suggestion, create a draft, or apply a new document version."""
        doc = await self._get_doc(kb_id=kb_id, doc_id=doc_id)
        if not self._can_write(role=role, is_app_admin=is_app_admin):
            return RequirementChangeResponse(
                action="suggestion_recorded",
                message="当前角色不能直接修改需求文档, 已记录为修改建议, 请产品确认.",
                previous_document_id=str(doc.id),
                filename=doc.filename,
                diff_summary=f"建议修改: {instruction.strip()}",
                markdown_preview=doc.markdown_content,
                ai_used=False,
                notification_event=self._event(
                    kb_id=kb_id,
                    doc=doc,
                    event_type="requirement.change_suggested",
                    message=f"{doc.filename} 收到一条修改建议.",
                ),
            )

        ai_change = None
        ai_error = None
        try:
            ai_change = await self.ai_service.apply_change(
                current_markdown=doc.markdown_content or "",
                instruction=instruction,
            )
        except Exception as exc:
            ai_error = str(exc)
            ai_change = None

        if ai_change is not None:
            new_markdown = ai_change.markdown_content
            diff_summary = ai_change.diff_summary
        else:
            new_markdown = _append_change(doc.markdown_content or "", instruction)
            diff_summary = f"新增变更说明: {instruction.strip()}"

        if not apply:
            draft = await rag_document_repo.create(
                self.db,
                collection_name=doc.collection_name,
                filename=doc.filename,
                filesize=len(new_markdown.encode("utf-8")),
                filetype=doc.filetype,
                storage_path=doc.storage_path or "",
                status="draft",
                markdown_content=new_markdown,
                version=doc.version + 1,
                is_latest=False,
                previous_version_id=doc.id,
                modified_by=user_id,
                organization_id=doc.organization_id,
                knowledge_base_id=doc.knowledge_base_id,
            )
            return RequirementChangeResponse(
                action="draft_created",
                message="已生成需求变更草稿, 等待产品审批.",
                previous_document_id=str(doc.id),
                document_id=str(draft.id),
                filename=draft.filename,
                diff_summary=diff_summary,
                markdown_preview=new_markdown,
                ai_used=ai_change is not None,
                ai_model=self.ai_service.model if ai_change is not None else None,
                ai_error=ai_error,
                notification_event=self._event(
                    kb_id=kb_id,
                    doc=draft,
                    event_type="requirement.draft_created",
                    message=f"{draft.filename} 已生成变更草稿.",
                ),
            )

        await rag_document_repo.mark_not_latest(self.db, doc.id)
        new_doc = await rag_document_repo.create(
            self.db,
            collection_name=doc.collection_name,
            filename=doc.filename,
            filesize=len(new_markdown.encode("utf-8")),
            filetype=doc.filetype,
            storage_path=doc.storage_path or "",
            status="done",
            markdown_content=new_markdown,
            version=doc.version + 1,
            is_latest=True,
            previous_version_id=doc.id,
            modified_by=user_id,
            organization_id=doc.organization_id,
            knowledge_base_id=doc.knowledge_base_id,
            chunk_count=doc.chunk_count,
            completed_at=datetime.now(UTC),
        )
        return RequirementChangeResponse(
            action="version_created",
            message="已创建需求文档新版本, 旧版本保留为历史版本.",
            previous_document_id=str(doc.id),
            document_id=str(new_doc.id),
            filename=new_doc.filename,
            diff_summary=diff_summary,
            markdown_preview=new_markdown,
            ai_used=ai_change is not None,
            ai_model=self.ai_service.model if ai_change is not None else None,
            ai_error=ai_error,
            notification_event=self._event(
                kb_id=kb_id,
                doc=new_doc,
                event_type="requirement.version_created",
                message=f"{new_doc.filename} 已更新到 v{new_doc.version}.",
            ),
        )

    async def _get_doc(self, *, kb_id: UUID, doc_id: UUID) -> RAGDocument:
        doc = await rag_document_repo.get_by_id(self.db, doc_id)
        if doc is None or doc.knowledge_base_id != kb_id:
            raise NotFoundError(
                message="Requirement document not found in this knowledge base",
                details={"kb_id": str(kb_id), "doc_id": str(doc_id)},
            )
        return doc

    @staticmethod
    def _can_write(*, role: str, is_app_admin: bool) -> bool:
        return is_app_admin or role in {"admin", "product"}

    @staticmethod
    def _event(
        *,
        kb_id: UUID,
        doc: RAGDocument,
        event_type: str,
        message: str,
    ) -> RequirementNotificationEvent:
        return RequirementNotificationEvent(
            event_type=event_type,
            kb_id=str(kb_id),
            document_id=str(doc.id),
            filename=doc.filename,
            message=message,
        )
{%- else %}
"""Requirement workflow service - not configured."""
{%- endif %}
