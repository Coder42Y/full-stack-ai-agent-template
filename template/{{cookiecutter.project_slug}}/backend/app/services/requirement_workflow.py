{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and cookiecutter.use_postgresql %}
"""Requirement workflow helpers for demoable KB MVP flows.

The service prefers a configured LLM for one-sentence intake, clarification
application, and document rewrite. Deterministic fallbacks keep local generated
projects and tests usable when no model endpoint is configured.
"""

from __future__ import annotations

import difflib
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.exceptions import BadRequestError, DatabaseError, NotFoundError
from app.db.models.audit_log import AppAdminAuditLog
from app.db.models.rag_document import RAGDocument
from app.repositories import rag_document_repo
from app.schemas.rag import (
    RequirementAuditLogItem,
    RequirementAuditLogList,
    RequirementBreakdownItem,
    RequirementBreakdownResponse,
    RequirementChangeResponse,
    RequirementClarificationAnswer,
    RequirementClarificationResponse,
    RequirementClarificationRound,
    RequirementClarificationSession,
    RequirementDraftCommentItem,
    RequirementDraftCommentList,
    RequirementDocumentDiffHunk,
    RequirementDocumentDiffLine,
    RequirementDocumentDiffResponse,
    RequirementDocumentVersionItem,
    RequirementDocumentVersionList,
    RequirementIntakeResponse,
    RequirementNotificationEvent,
)
from app.services.requirement_ai import RequirementAIService
from app.services.rag.ingestion import IngestionService
from app.services.rag.models import IngestionStatus


logger = logging.getLogger(__name__)

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
_SPACE_RE = re.compile(r"\s+")
_DIFF_HUNK_RE = re.compile(
    r"^@@ -(?P<old_start>\d+)(?:,(?P<old_count>\d+))? "
    r"\+(?P<new_start>\d+)(?:,(?P<new_count>\d+))? @@"
)
_CLARIFICATION_STARTED = "requirement.clarification_started"
_CLARIFICATION_ANSWERED = "requirement.clarification_answered"


@dataclass(frozen=True)
class _VectorReindexResult:
    vector_document_id: str | None = None
    chunk_count: int | None = None
    error: str | None = None


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


def _string_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _details_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _iso_time(value: Any) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


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


def _structured_diff(diff_lines: list[str]) -> list[RequirementDocumentDiffHunk]:
    """Convert unified diff lines into UI-friendly hunks."""
    hunks: list[RequirementDocumentDiffHunk] = []
    current: RequirementDocumentDiffHunk | None = None
    old_line: int | None = None
    new_line: int | None = None

    for line in diff_lines:
        match = _DIFF_HUNK_RE.match(line)
        if match:
            old_start = int(match.group("old_start"))
            new_start = int(match.group("new_start"))
            old_line = old_start
            new_line = new_start
            current = RequirementDocumentDiffHunk(
                header=line,
                old_start=old_start,
                old_count=int(match.group("old_count") or "1"),
                new_start=new_start,
                new_count=int(match.group("new_count") or "1"),
            )
            hunks.append(current)
            continue

        if current is None or line.startswith("---") or line.startswith("+++"):
            continue

        if line.startswith("-"):
            current.lines.append(
                RequirementDocumentDiffLine(
                    kind="removed",
                    content=line[1:],
                    old_line_number=old_line,
                )
            )
            old_line = old_line + 1 if old_line is not None else None
            continue

        if line.startswith("+"):
            current.lines.append(
                RequirementDocumentDiffLine(
                    kind="added",
                    content=line[1:],
                    new_line_number=new_line,
                )
            )
            new_line = new_line + 1 if new_line is not None else None
            continue

        content = line[1:] if line.startswith(" ") else line
        current.lines.append(
            RequirementDocumentDiffLine(
                kind="context",
                content=content,
                old_line_number=old_line,
                new_line_number=new_line,
            )
        )
        old_line = old_line + 1 if old_line is not None else None
        new_line = new_line + 1 if new_line is not None else None

    return hunks


class RequirementWorkflowService:
    """Create, break down, and change requirement Markdown documents."""

    def __init__(
        self,
        db: AsyncSession,
        ai_service: RequirementAIService | None = None,
        ingestion_service: IngestionService | None = None,
    ):
        self.db = db
        self.ai_service = ai_service or RequirementAIService()
        self.ingestion_service = ingestion_service

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
        await record_audit(
            self.db,
            actor_user_id=user_id,
            action=_CLARIFICATION_STARTED,
            organization_id=organization_id,
            target_type="rag_document",
            target_id=str(doc.id),
            details={
                "knowledge_base_id": str(kb.id),
                "document_id": str(doc.id),
                "filename": doc.filename,
                "state": "clarifying" if questions else "ingested",
                "questions": questions,
                "description": _compact(description, limit=1000),
                "ai_used": ai_result is not None,
            },
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
                diff_summary="一句话需求已生成 Markdown 草案.",
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
            items=[self._version_item(version) for version in versions],
            total=len(versions),
        )

    async def list_pending_drafts(
        self,
        *,
        kb_id: UUID,
    ) -> RequirementDocumentVersionList:
        """List all draft requirement versions waiting for product review."""
        drafts = await rag_document_repo.get_pending_drafts_for_kb(
            self.db,
            knowledge_base_id=kb_id,
        )
        return RequirementDocumentVersionList(
            items=[self._version_item(draft) for draft in drafts],
            total=len(drafts),
        )

    async def get_clarification_session(
        self,
        *,
        kb_id: UUID,
        doc_id: UUID,
        organization_id: UUID | None = None,
    ) -> RequirementClarificationSession:
        """Return persisted clarification state for one requirement document."""
        doc = await self._get_doc(kb_id=kb_id, doc_id=doc_id)
        return await self._load_clarification_session(
            doc=doc,
            kb_id=kb_id,
            organization_id=organization_id,
        )

    async def answer_clarifications(
        self,
        *,
        kb_id: UUID,
        doc_id: UUID,
        answers: list[RequirementClarificationAnswer],
        apply: bool,
        user_id: UUID,
        role: str,
        is_app_admin: bool,
        organization_id: UUID | None = None,
    ) -> RequirementClarificationResponse:
        """Persist one clarification round and apply the answers as a requirement change."""
        if not answers:
            raise BadRequestError(
                message="At least one clarification answer is required",
                details={"kb_id": str(kb_id), "doc_id": str(doc_id)},
            )
        doc = await self._get_doc(kb_id=kb_id, doc_id=doc_id)
        session = await self._load_clarification_session(
            doc=doc,
            kb_id=kb_id,
            organization_id=organization_id,
        )
        next_round = session.latest_round + 1
        entry = await record_audit(
            self.db,
            actor_user_id=user_id,
            action=_CLARIFICATION_ANSWERED,
            organization_id=doc.organization_id,
            target_type="rag_document",
            target_id=str(doc.id),
            details={
                "knowledge_base_id": str(kb_id),
                "document_id": str(doc.id),
                "filename": doc.filename,
                "round": next_round,
                "state": "awaiting_confirmation",
                "answers": [answer.model_dump() for answer in answers],
            },
        )
        if entry is None:
            raise DatabaseError(
                message="Failed to persist requirement clarification answers",
                details={"kb_id": str(kb_id), "doc_id": str(doc_id)},
            )

        instruction = self._clarification_instruction(answers)
        change = await self.change_document(
            kb_id=kb_id,
            doc_id=doc_id,
            instruction=instruction,
            apply=apply,
            user_id=user_id,
            role=role,
            is_app_admin=is_app_admin,
        )
        updated = await self._load_clarification_session(
            doc=doc,
            kb_id=kb_id,
            organization_id=organization_id,
        )
        return RequirementClarificationResponse(session=updated, change=change)

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
            structured_changes=_structured_diff(diff_lines),
        )

    async def list_requirement_audit_logs(
        self,
        *,
        kb_id: UUID,
        organization_id: UUID | None = None,
        limit: int = 50,
    ) -> RequirementAuditLogList:
        """List requirement audit events scoped to one knowledge base."""
        stmt = (
            select(AppAdminAuditLog)
            .where(AppAdminAuditLog.action.like("requirement.%"))
            .order_by(AppAdminAuditLog.created_at.desc())
            .limit(min(max(limit * 3, limit), 150))
        )
        if organization_id is not None:
            stmt = stmt.where(AppAdminAuditLog.organization_id == organization_id)
        result = await self.db.execute(stmt)
        rows = result.scalars().all()

        items: list[RequirementAuditLogItem] = []
        for entry in rows:
            details = _details_dict(getattr(entry, "details", None))
            if details.get("knowledge_base_id") != str(kb_id):
                continue
            items.append(
                RequirementAuditLogItem(
                    id=str(entry.id),
                    action=entry.action,
                    actor_user_id=str(entry.actor_user_id),
                    organization_id=(
                        str(entry.organization_id)
                        if entry.organization_id is not None
                        else None
                    ),
                    target_type=entry.target_type,
                    target_id=entry.target_id,
                    details=details,
                    created_at=entry.created_at.isoformat()
                    if getattr(entry, "created_at", None)
                    else None,
                )
            )
            if len(items) >= limit:
                break

        return RequirementAuditLogList(items=items, total=len(items))

    async def list_draft_comments(
        self,
        *,
        kb_id: UUID,
        draft_doc_id: UUID,
        organization_id: UUID | None = None,
        limit: int = 50,
    ) -> RequirementDraftCommentList:
        """List the persisted comment stream for a draft document."""
        await self._get_doc(kb_id=kb_id, doc_id=draft_doc_id)
        stmt = (
            select(AppAdminAuditLog)
            .where(AppAdminAuditLog.action == "requirement.draft_commented")
            .where(AppAdminAuditLog.target_id == str(draft_doc_id))
            .order_by(AppAdminAuditLog.created_at.asc())
            .limit(limit)
        )
        if organization_id is not None:
            stmt = stmt.where(AppAdminAuditLog.organization_id == organization_id)
        result = await self.db.execute(stmt)
        rows = result.scalars().all()

        items: list[RequirementDraftCommentItem] = []
        for entry in rows:
            details = _details_dict(getattr(entry, "details", None))
            if details.get("knowledge_base_id") != str(kb_id):
                continue
            if details.get("document_id") != str(draft_doc_id):
                continue
            body = details.get("body")
            if not isinstance(body, str) or not body:
                continue
            role = details.get("role")
            items.append(
                RequirementDraftCommentItem(
                    id=str(entry.id),
                    document_id=str(draft_doc_id),
                    author_user_id=str(entry.actor_user_id),
                    role=role if isinstance(role, str) else "product",
                    body=body,
                    created_at=entry.created_at.isoformat()
                    if getattr(entry, "created_at", None)
                    else None,
                )
            )

        return RequirementDraftCommentList(items=items, total=len(items))

    async def add_draft_comment(
        self,
        *,
        kb_id: UUID,
        draft_doc_id: UUID,
        user_id: UUID,
        role: str,
        body: str,
    ) -> RequirementDraftCommentItem:
        """Append a comment to a requirement draft via the audit event stream."""
        draft = await self._get_doc(kb_id=kb_id, doc_id=draft_doc_id)
        comment_body = _compact(body, limit=2000)
        entry = await record_audit(
            self.db,
            actor_user_id=user_id,
            action="requirement.draft_commented",
            organization_id=draft.organization_id,
            target_type="rag_document",
            target_id=str(draft.id),
            details={
                "knowledge_base_id": str(kb_id),
                "document_id": str(draft.id),
                "role": role,
                "body": comment_body,
                "status": draft.status,
            },
        )
        if entry is None:
            raise DatabaseError(
                message="Failed to persist requirement draft comment",
                details={"kb_id": str(kb_id), "doc_id": str(draft_doc_id)},
            )
        await self.db.flush()

        return RequirementDraftCommentItem(
            id=str(getattr(entry, "id", "")),
            document_id=str(draft.id),
            author_user_id=str(user_id),
            role=role,
            body=comment_body,
            created_at=entry.created_at.isoformat()
            if entry is not None and getattr(entry, "created_at", None)
            else None,
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
            diff_summary = f"建议修改: {instruction.strip()}"
            return RequirementChangeResponse(
                action="suggestion_recorded",
                message="修改建议已记录, 需要产品确认后才能进入草稿或生成新版本.",
                previous_document_id=str(doc.id),
                filename=doc.filename,
                diff_summary=diff_summary,
                ai_used=False,
                notification_event=self._event(
                    kb_id=kb_id,
                    doc=doc,
                    event_type="requirement.change_suggested",
                    message=f"{doc.filename} 收到开发修改建议, 等待产品确认.",
                    diff_summary=diff_summary,
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
                    diff_summary=diff_summary,
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
        reindex_result = await self._reindex_latest_version(
            doc=new_doc,
            previous_vector_document_id=_string_or_none(
                getattr(doc, "vector_document_id", None)
            ),
        )
        self._apply_reindex_result(doc=new_doc, result=reindex_result)
        await record_audit(
            self.db,
            actor_user_id=user_id,
            action="requirement.version_created",
            organization_id=doc.organization_id,
            target_type="rag_document",
            target_id=str(new_doc.id),
            details={
                "knowledge_base_id": str(kb_id),
                "previous_document_id": str(doc.id),
                "previous_version": doc.version,
                "new_document_id": str(new_doc.id),
                "new_version": new_doc.version,
                "instruction": _compact(instruction, limit=1000),
                "diff_summary": diff_summary,
                "ai_used": ai_change is not None,
            },
        )
        await self.db.flush()

        message = "已创建需求文档新版本, 旧版本保留为历史版本."
        if reindex_result.error:
            message = (
                "已创建需求文档新版本, 但向量索引重建失败; "
                "查询会继续使用最新 Markdown fallback."
            )
        return RequirementChangeResponse(
            action="version_created",
            message=message,
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
                diff_summary=diff_summary,
            ),
        )

    async def apply_draft(
        self,
        *,
        kb_id: UUID,
        draft_doc_id: UUID,
        user_id: UUID,
        role: str,
        is_app_admin: bool,
    ) -> RequirementChangeResponse:
        """Approve a draft requirement document and make it the latest version."""
        draft = await self._get_doc(kb_id=kb_id, doc_id=draft_doc_id)
        previous_doc_id = (
            str(draft.previous_version_id) if draft.previous_version_id else None
        )

        if not self._can_write(role=role, is_app_admin=is_app_admin):
            return RequirementChangeResponse(
                action="approval_denied",
                message="当前角色不能审批变更草稿, 请产品确认.",
                previous_document_id=previous_doc_id,
                document_id=str(draft.id),
                filename=draft.filename,
                diff_summary="当前只读身份只能查看草稿并提交建议, 不能审批应用.",
                markdown_preview=draft.markdown_content,
                ai_used=False,
                notification_event=self._event(
                    kb_id=kb_id,
                    doc=draft,
                    event_type="requirement.draft_review_denied",
                    message=f"{draft.filename} 草稿审批被拒绝: 当前角色无写入权限.",
                    diff_summary="当前只读身份不能审批草稿.",
                ),
            )

        if draft.status != "draft":
            return RequirementChangeResponse(
                action="not_a_draft",
                message="选中的文档不是待审批草稿, 无需应用.",
                previous_document_id=previous_doc_id,
                document_id=str(draft.id),
                filename=draft.filename,
                diff_summary="仅 status=draft 的需求版本可以审批应用.",
                markdown_preview=draft.markdown_content,
                ai_used=False,
            )

        previous_doc = None
        if draft.previous_version_id is not None:
            previous_doc = await rag_document_repo.mark_not_latest(
                self.db,
                draft.previous_version_id,
            )
        draft.status = "done"
        draft.is_latest = True
        draft.modified_by = user_id
        draft.completed_at = datetime.now(UTC)
        reindex_result = await self._reindex_latest_version(
            doc=draft,
            previous_vector_document_id=_string_or_none(
                getattr(previous_doc, "vector_document_id", None)
            ),
        )
        self._apply_reindex_result(doc=draft, result=reindex_result)
        await record_audit(
            self.db,
            actor_user_id=user_id,
            action="requirement.draft_applied",
            organization_id=draft.organization_id,
            target_type="rag_document",
            target_id=str(draft.id),
            details={
                "knowledge_base_id": str(kb_id),
                "draft_document_id": str(draft.id),
                "previous_document_id": previous_doc_id,
                "new_version": draft.version,
            },
        )
        await self.db.flush()

        message = "已审批并应用变更草稿, 草稿现在成为最新需求版本."
        if reindex_result.error:
            message = (
                "已审批并应用变更草稿, 但向量索引重建失败; "
                "查询会继续使用最新 Markdown fallback."
            )
        return RequirementChangeResponse(
            action="draft_applied",
            message=message,
            previous_document_id=previous_doc_id,
            document_id=str(draft.id),
            filename=draft.filename,
            diff_summary=f"{draft.filename} 已应用为 v{draft.version}.",
            markdown_preview=draft.markdown_content,
            ai_used=False,
            notification_event=self._event(
                kb_id=kb_id,
                doc=draft,
                event_type="requirement.draft_applied",
                message=f"{draft.filename} 草稿已审批并应用为 v{draft.version}.",
                diff_summary=f"{draft.filename} 已应用为 v{draft.version}.",
            ),
        )

    async def reject_draft(
        self,
        *,
        kb_id: UUID,
        draft_doc_id: UUID,
        user_id: UUID,
        role: str,
        is_app_admin: bool,
        reason: str | None = None,
    ) -> RequirementChangeResponse:
        """Reject a draft requirement document while keeping the current latest version."""
        draft = await self._get_doc(kb_id=kb_id, doc_id=draft_doc_id)
        previous_doc_id = (
            str(draft.previous_version_id) if draft.previous_version_id else None
        )

        if not self._can_write(role=role, is_app_admin=is_app_admin):
            return RequirementChangeResponse(
                action="approval_denied",
                message="当前角色不能拒绝变更草稿, 请产品确认.",
                previous_document_id=previous_doc_id,
                document_id=str(draft.id),
                filename=draft.filename,
                diff_summary="当前只读身份只能查看草稿并提交建议, 不能审批拒绝.",
                markdown_preview=draft.markdown_content,
                ai_used=False,
                notification_event=self._event(
                    kb_id=kb_id,
                    doc=draft,
                    event_type="requirement.draft_review_denied",
                    message=f"{draft.filename} 草稿审批被拒绝: 当前角色无写入权限.",
                    diff_summary="当前只读身份不能审批草稿.",
                ),
            )

        if draft.status != "draft":
            return RequirementChangeResponse(
                action="not_a_draft",
                message="选中的文档不是待审批草稿, 无需拒绝.",
                previous_document_id=previous_doc_id,
                document_id=str(draft.id),
                filename=draft.filename,
                diff_summary="仅 status=draft 的需求版本可以拒绝.",
                markdown_preview=draft.markdown_content,
                ai_used=False,
            )

        review_note = _compact(reason or "产品拒绝该变更草稿.", limit=1000)
        draft.status = "rejected"
        draft.is_latest = False
        draft.modified_by = user_id
        draft.error_message = review_note
        draft.completed_at = datetime.now(UTC)
        await record_audit(
            self.db,
            actor_user_id=user_id,
            action="requirement.draft_rejected",
            organization_id=draft.organization_id,
            target_type="rag_document",
            target_id=str(draft.id),
            details={
                "knowledge_base_id": str(kb_id),
                "draft_document_id": str(draft.id),
                "previous_document_id": previous_doc_id,
                "reason": review_note,
            },
        )
        await self.db.flush()

        return RequirementChangeResponse(
            action="draft_rejected",
            message="已拒绝变更草稿, 当前最新版本保持不变.",
            previous_document_id=previous_doc_id,
            document_id=str(draft.id),
            filename=draft.filename,
            diff_summary=f"拒绝原因: {review_note}",
            markdown_preview=draft.markdown_content,
            ai_used=False,
            notification_event=self._event(
                kb_id=kb_id,
                doc=draft,
                event_type="requirement.draft_rejected",
                message=f"{draft.filename} 变更草稿已被拒绝.",
                diff_summary=f"拒绝原因: {review_note}",
            ),
        )

    async def rollback_document(
        self,
        *,
        kb_id: UUID,
        target_doc_id: UUID,
        user_id: UUID,
        role: str,
        is_app_admin: bool,
        reason: str | None = None,
    ) -> RequirementChangeResponse:
        """Create a new latest version from a historical requirement version."""
        target = await self._get_doc(kb_id=kb_id, doc_id=target_doc_id)

        if not self._can_write(role=role, is_app_admin=is_app_admin):
            return RequirementChangeResponse(
                action="rollback_denied",
                message="当前角色不能回滚需求版本, 请产品确认.",
                previous_document_id=str(target.id),
                document_id=str(target.id),
                filename=target.filename,
                diff_summary="当前只读身份只能查看历史版本, 不能创建回滚版本.",
                markdown_preview=target.markdown_content,
                ai_used=False,
                notification_event=self._event(
                    kb_id=kb_id,
                    doc=target,
                    event_type="requirement.rollback_denied",
                    message=f"{target.filename} 版本回滚被拒绝: 当前角色无写入权限.",
                    diff_summary="当前只读身份不能回滚需求版本.",
                ),
            )

        versions = await rag_document_repo.get_version_chain_for_document(
            self.db,
            knowledge_base_id=kb_id,
            document_id=target_doc_id,
        )
        if not versions:
            raise NotFoundError(
                message="Requirement document not found in this knowledge base",
                details={"kb_id": str(kb_id), "doc_id": str(target_doc_id)},
            )

        latest = next((version for version in versions if version.is_latest), None)
        if latest is None:
            latest = max(versions, key=lambda version: version.version)

        if target.id == latest.id:
            return RequirementChangeResponse(
                action="already_latest",
                message="选中的版本已经是最新版本, 无需回滚.",
                previous_document_id=str(latest.id),
                document_id=str(latest.id),
                filename=latest.filename,
                diff_summary="无需回滚.",
                markdown_preview=latest.markdown_content,
                ai_used=False,
            )

        rollback_reason = _compact(reason or "产品回滚到历史版本.", limit=1000)
        await rag_document_repo.mark_not_latest(self.db, latest.id)
        rollback_doc = await rag_document_repo.create(
            self.db,
            collection_name=target.collection_name,
            filename=target.filename,
            filesize=len((target.markdown_content or "").encode("utf-8")),
            filetype=target.filetype,
            storage_path=target.storage_path or "",
            status="done",
            markdown_content=target.markdown_content,
            version=latest.version + 1,
            is_latest=True,
            previous_version_id=latest.id,
            modified_by=user_id,
            organization_id=target.organization_id,
            knowledge_base_id=target.knowledge_base_id,
            chunk_count=target.chunk_count,
            completed_at=datetime.now(UTC),
        )
        rollback_doc.error_message = (
            f"回滚自 v{target.version}: {rollback_reason}"
        )
        reindex_result = await self._reindex_latest_version(
            doc=rollback_doc,
            previous_vector_document_id=_string_or_none(
                getattr(latest, "vector_document_id", None)
            ),
        )
        self._apply_reindex_result(doc=rollback_doc, result=reindex_result)
        await record_audit(
            self.db,
            actor_user_id=user_id,
            action="requirement.rollback",
            organization_id=target.organization_id,
            target_type="rag_document",
            target_id=str(rollback_doc.id),
            details={
                "knowledge_base_id": str(kb_id),
                "from_document_id": str(latest.id),
                "from_version": latest.version,
                "rolled_back_to_document_id": str(target.id),
                "rolled_back_to_version": target.version,
                "new_document_id": str(rollback_doc.id),
                "new_version": rollback_doc.version,
                "reason": rollback_reason,
            },
        )
        await self.db.flush()

        message = (
            f"已从 v{target.version} 创建回滚版本 v{rollback_doc.version}, "
            "旧最新版保留为历史版本."
        )
        if reindex_result.error:
            message = (
                f"已从 v{target.version} 创建回滚版本 v{rollback_doc.version}, "
                "但向量索引重建失败; 查询会继续使用最新 Markdown fallback."
            )
        diff_summary = (
            f"从 v{latest.version} 回滚到 v{target.version}. 原因: {rollback_reason}"
        )
        return RequirementChangeResponse(
            action="version_rolled_back",
            message=message,
            previous_document_id=str(latest.id),
            document_id=str(rollback_doc.id),
            filename=rollback_doc.filename,
            diff_summary=diff_summary,
            markdown_preview=rollback_doc.markdown_content,
            ai_used=False,
            notification_event=self._event(
                kb_id=kb_id,
                doc=rollback_doc,
                event_type="requirement.version_rolled_back",
                message=(
                    f"{rollback_doc.filename} 已回滚到 v{target.version}, "
                    f"并创建 v{rollback_doc.version}."
                ),
                diff_summary=diff_summary,
            ),
        )

    async def _reindex_latest_version(
        self,
        *,
        doc: RAGDocument,
        previous_vector_document_id: str | None = None,
    ) -> _VectorReindexResult:
        """Rebuild vector chunks for the latest Markdown version."""
        markdown = (doc.markdown_content or "").strip()
        if not markdown:
            return _VectorReindexResult(error="Document has no Markdown content.")

        try:
            ingestion = self.ingestion_service or IngestionService.from_settings()
            with TemporaryDirectory(prefix="req-kb-reindex-") as tmpdir:
                markdown_path = Path(tmpdir) / f"{doc.id}.md"
                markdown_path.write_text(markdown, encoding="utf-8")
                result = await ingestion.ingest_file(
                    filepath=markdown_path,
                    collection_name=doc.collection_name,
                    replace=False,
                    source_path=self._vector_source_path(doc),
                )

            if result.status != IngestionStatus.DONE or not result.document_id:
                error = result.error_message or result.message or "Unknown ingestion error."
                return _VectorReindexResult(error=error)

            if (
                previous_vector_document_id
                and previous_vector_document_id != result.document_id
            ):
                removed = await ingestion.remove_document(
                    doc.collection_name,
                    previous_vector_document_id,
                )
                if not removed:
                    return _VectorReindexResult(
                        vector_document_id=result.document_id,
                        chunk_count=result.chunk_count,
                        error="Previous vector document could not be removed.",
                    )

            return _VectorReindexResult(
                vector_document_id=result.document_id,
                chunk_count=result.chunk_count,
            )
        except Exception as exc:
            logger.warning(
                "Requirement vector reindex failed for %s: %s",
                getattr(doc, "id", None),
                exc,
            )
            return _VectorReindexResult(error=str(exc))

    @staticmethod
    def _version_item(version: RAGDocument) -> RequirementDocumentVersionItem:
        return RequirementDocumentVersionItem(
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
            review_note=version.error_message,
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

    @staticmethod
    def _apply_reindex_result(
        *,
        doc: RAGDocument,
        result: _VectorReindexResult,
    ) -> None:
        if result.vector_document_id:
            doc.vector_document_id = result.vector_document_id
        if result.chunk_count is not None:
            doc.chunk_count = result.chunk_count

    @staticmethod
    def _vector_source_path(doc: RAGDocument) -> str:
        return f"req-kb://{doc.knowledge_base_id}/{doc.id}/{doc.filename}"

    async def _get_doc(self, *, kb_id: UUID, doc_id: UUID) -> RAGDocument:
        doc = await rag_document_repo.get_by_id(self.db, doc_id)
        if doc is None or doc.knowledge_base_id != kb_id:
            raise NotFoundError(
                message="Requirement document not found in this knowledge base",
                details={"kb_id": str(kb_id), "doc_id": str(doc_id)},
            )
        return doc

    async def _load_clarification_session(
        self,
        *,
        doc: RAGDocument,
        kb_id: UUID,
        organization_id: UUID | None = None,
    ) -> RequirementClarificationSession:
        stmt = (
            select(AppAdminAuditLog)
            .where(
                AppAdminAuditLog.action.in_(
                    [_CLARIFICATION_STARTED, _CLARIFICATION_ANSWERED]
                )
            )
            .where(AppAdminAuditLog.target_id == str(doc.id))
            .order_by(AppAdminAuditLog.created_at.asc())
            .limit(100)
        )
        if organization_id is not None:
            stmt = stmt.where(AppAdminAuditLog.organization_id == organization_id)
        result = await self.db.execute(stmt)
        rows = result.scalars().all()

        session_id: str | None = None
        questions: list[str] = []
        rounds: list[RequirementClarificationRound] = []
        state = "ingested"
        created_at: str | None = None
        updated_at: str | None = None

        for entry in rows:
            details = _details_dict(getattr(entry, "details", None))
            if details.get("knowledge_base_id") != str(kb_id):
                continue
            if details.get("document_id") != str(doc.id):
                continue

            entry_time = _iso_time(getattr(entry, "created_at", None))
            updated_at = entry_time or updated_at
            if created_at is None:
                created_at = entry_time

            if entry.action == _CLARIFICATION_STARTED:
                session_id = str(entry.id)
                raw_questions = details.get("questions")
                if isinstance(raw_questions, list):
                    questions = [
                        item for item in raw_questions if isinstance(item, str)
                    ]
                raw_state = details.get("state")
                if isinstance(raw_state, str):
                    state = raw_state
                continue

            if entry.action != _CLARIFICATION_ANSWERED:
                continue
            raw_answers = details.get("answers")
            answers: list[RequirementClarificationAnswer] = []
            if isinstance(raw_answers, list):
                answers = [
                    RequirementClarificationAnswer.model_validate(answer)
                    for answer in raw_answers
                    if isinstance(answer, dict)
                ]
            raw_round = details.get("round")
            round_number = raw_round if isinstance(raw_round, int) else len(rounds) + 1
            rounds.append(
                RequirementClarificationRound(
                    id=str(entry.id),
                    round=round_number,
                    answers=answers,
                    actor_user_id=str(entry.actor_user_id),
                    created_at=entry_time,
                )
            )
            state = "awaiting_confirmation"

        latest_round = max((round_item.round for round_item in rounds), default=0)
        if rounds and getattr(doc, "status", None) == "done":
            state = "ingested"

        return RequirementClarificationSession(
            session_id=session_id,
            kb_id=str(kb_id),
            document_id=str(doc.id),
            filename=doc.filename,
            state=state,
            questions=questions,
            rounds=rounds,
            latest_round=latest_round,
            created_at=created_at,
            updated_at=updated_at,
        )

    @staticmethod
    def _clarification_instruction(
        answers: list[RequirementClarificationAnswer],
    ) -> str:
        lines = []
        for answer in answers:
            lines.append(f"- {answer.question.strip()}\n  回答: {answer.answer.strip()}")
        return "根据以下澄清回答更新需求文档:\n" + "\n".join(lines)

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
        diff_summary: str | None = None,
    ) -> RequirementNotificationEvent:
        version = getattr(doc, "version", None)
        if not isinstance(version, int):
            version = None
        status = getattr(doc, "status", None)
        if not isinstance(status, str):
            status = None
        return RequirementNotificationEvent(
            event_type=event_type,
            kb_id=str(kb_id),
            document_id=str(doc.id),
            filename=doc.filename,
            message=message,
            version=version,
            status=status,
            diff_summary=diff_summary,
        )
{%- else %}
"""Requirement workflow service - not configured."""
{%- endif %}
