{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
"""Grounded requirement querying over RAG chunks plus stored Markdown originals."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

{%- if cookiecutter.use_postgresql %}
from uuid import UUID
{%- endif %}

from app.repositories import rag_document_repo
from app.schemas.rag import RequirementQueryResponse, RequirementQuerySource
from app.services.requirement_ai import RequirementAIService
from app.services.rag.retrieval import RetrievalService


_SPACE_RE = re.compile(r"\s+")
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
_TOKEN_RE = re.compile(r"[A-Za-z0-9_\u4e00-\u9fff]+")
_CJK_RE = re.compile(r"[\u4e00-\u9fff]+")


@dataclass(frozen=True)
class _SourceCandidate:
    document_id: str
    vector_document_id: str | None
    filename: str
    label: str
    score: float
    page_num: int | None
    chunk_num: int | None
    excerpt: str
    from_markdown: bool


def _compact(text: str, *, limit: int = 700) -> str:
    """Normalize source text for compact API output."""
    compacted = _SPACE_RE.sub(" ", text).strip()
    if len(compacted) <= limit:
        return compacted
    return compacted[: limit - 3].rstrip() + "..."


def _locate_excerpt(markdown: str, chunk_text: str, *, limit: int = 700) -> str:
    """Return an excerpt from stored Markdown around the retrieved chunk."""
    if not markdown.strip():
        return _compact(chunk_text, limit=limit)

    needle = _compact(chunk_text, limit=180)
    if needle:
        idx = _compact(markdown, limit=len(markdown)).find(needle)
        if idx >= 0:
            start = max(0, idx - 220)
            end = min(len(markdown), idx + len(needle) + 420)
            return _compact(markdown[start:end], limit=limit)

    return _compact(markdown, limit=limit)


def _source_label(filename: str, page_num: int | None, chunk_num: int | None) -> str:
    parts = [filename]
    if page_num is not None:
        parts.append(f"page {page_num}")
    if chunk_num is not None:
        parts.append(f"chunk {chunk_num}")
    return " > ".join(parts)


def _tokens(text: str) -> list[str]:
    """Extract simple query tokens for deterministic Markdown fallback search."""
    tokens: list[str] = []
    for token in _TOKEN_RE.findall(text):
        token = token.strip().lower()
        if not token:
            continue
        tokens.append(token)
        for cjk in _CJK_RE.findall(token):
            if len(cjk) <= 3:
                continue
            tokens.extend(cjk[idx : idx + 2] for idx in range(len(cjk) - 1))
            tokens.extend(cjk[idx : idx + 3] for idx in range(len(cjk) - 2))
    return list(dict.fromkeys(tokens))


def _markdown_score(query: str, markdown: str) -> float:
    """Return a deterministic relevance score for stored Markdown fallback."""
    if not markdown.strip():
        return 0.0
    query_norm = query.strip().lower()
    markdown_norm = markdown.lower()
    if query_norm and query_norm in markdown_norm:
        return 1.0
    tokens = _tokens(query)
    if not tokens:
        return 0.25
    matches = sum(1 for token in tokens if token in markdown_norm)
    if matches == 0:
        return 0.0
    return matches / len(tokens)


def _markdown_sections(markdown: str) -> list[tuple[str | None, str]]:
    """Split Markdown by headings while keeping a whole-document fallback."""
    matches = list(_HEADING_RE.finditer(markdown))
    if not matches:
        return [(None, markdown)]
    sections: list[tuple[str | None, str]] = []
    for idx, match in enumerate(matches):
        title = match.group(2).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown)
        body = markdown[start:end].strip()
        if body:
            sections.append((title, body))
    return sections or [(None, markdown)]


def _best_markdown_excerpt(query: str, markdown: str) -> tuple[str | None, str]:
    """Pick the most relevant Markdown section for a grounded answer."""
    best_title: str | None = None
    best_body = markdown
    best_score = -1.0
    for title, body in _markdown_sections(markdown):
        score = _markdown_score(query, f"{title or ''}\n{body}")
        if ("回答:" in body or "回答\uff1a" in body) and score > 0:
            score += 0.35
        if score > best_score:
            best_title = title
            best_body = body
            best_score = score
    return best_title, _compact(best_body)


class RequirementQueryService:
    """Query requirement KBs and return answers grounded in original Markdown."""

    def __init__(
        self,
        db: Any,
        retrieval_service: RetrievalService | None = None,
        ai_service: RequirementAIService | None = None,
    ):
        self.db = db
        self.retrieval_service = retrieval_service
        self.ai_service = ai_service or RequirementAIService()

{%- if cookiecutter.use_postgresql %}
    async def query_kb(
        self,
        *,
        kb_id: UUID,
        collection_name: str,
        query: str,
        role: str = "developer",
        limit: int = 5,
        min_score: float = 0.0,
    ) -> RequirementQueryResponse:
        """Run vector retrieval and fall back to stored Markdown search."""
        sources: list[_SourceCandidate] = []
        seen: set[tuple[str | None, int | None]] = set()

        if self.retrieval_service is not None:
            try:
                hits = await self.retrieval_service.retrieve(
                    query=query,
                    collection_name=collection_name,
                    limit=limit,
                    min_score=min_score,
                )
            except Exception:
                hits = []

            for hit in hits:
                key = (hit.parent_doc_id, hit.metadata.get("chunk_num"))
                if key in seen:
                    continue
                seen.add(key)

                doc = None
                if hit.parent_doc_id:
                    doc = await rag_document_repo.get_latest_by_vector_document_id(
                        self.db,
                        collection_name=collection_name,
                        vector_document_id=hit.parent_doc_id,
                        knowledge_base_id=kb_id,
                    )

                filename = getattr(doc, "filename", None) or hit.metadata.get("filename") or "unknown"
                page_num = hit.metadata.get("page_num")
                chunk_num = hit.metadata.get("chunk_num")
                markdown = getattr(doc, "markdown_content", None) or ""
                excerpt = _locate_excerpt(markdown, hit.content)
                sources.append(
                    _SourceCandidate(
                        document_id=str(getattr(doc, "id", hit.parent_doc_id or "")),
                        vector_document_id=hit.parent_doc_id,
                        filename=filename,
                        label=_source_label(filename, page_num, chunk_num),
                        score=hit.score,
                        page_num=page_num,
                        chunk_num=chunk_num,
                        excerpt=excerpt,
                        from_markdown=bool(markdown),
                    )
                )

        if not any(source.from_markdown for source in sources):
            sources.extend(
                await self._markdown_fallback(
                    kb_id=kb_id,
                    collection_name=collection_name,
                    query=query,
                    limit=limit,
                    seen_doc_ids={source.document_id for source in sources},
                )
            )

        return await self._build_response(query=query, role=role, sources=sources)

    async def _markdown_fallback(
        self,
        *,
        kb_id: UUID,
        collection_name: str,
        query: str,
        limit: int,
        seen_doc_ids: set[str],
    ) -> list[_SourceCandidate]:
        docs = await rag_document_repo.get_latest_markdown_for_kb(
            self.db,
            knowledge_base_id=kb_id,
            collection_name=collection_name,
        )
        candidates: list[_SourceCandidate] = []
        for doc in docs:
            if str(doc.id) in seen_doc_ids:
                continue
            markdown = doc.markdown_content or ""
            score = _markdown_score(query, markdown)
            if score <= 0:
                continue
            section_title, excerpt = _best_markdown_excerpt(query, markdown)
            label = doc.filename if section_title is None else f"{doc.filename} > {section_title}"
            candidates.append(
                _SourceCandidate(
                    document_id=str(doc.id),
                    vector_document_id=doc.vector_document_id,
                    filename=doc.filename,
                    label=label,
                    score=score,
                    page_num=None,
                    chunk_num=None,
                    excerpt=excerpt,
                    from_markdown=True,
                )
            )
        candidates.sort(key=lambda source: source.score, reverse=True)
        return candidates[:limit]

{%- elif cookiecutter.use_sqlite %}
    def query_kb(
        self,
        *,
        kb_id: str,
        collection_name: str,
        query: str,
        limit: int = 5,
        min_score: float = 0.0,
    ) -> RequirementQueryResponse:
        """SQLite fallback for generated projects without async DB."""
        raise NotImplementedError(
            "Requirement grounded query is implemented for the PostgreSQL async demo path."
        )

{%- endif %}

    async def _build_response(
        self,
        *,
        query: str,
        role: str,
        sources: list[_SourceCandidate],
    ) -> RequirementQueryResponse:
        if not sources:
            return RequirementQueryResponse(
                answer="未找到可精确引用的原文, 可能需要先上传并完成需求文档入库.",
                sources=[],
                is_grounded=False,
                message="No precise source found.",
            )

        grounded = [source for source in sources if source.from_markdown]
        selected = grounded or sources
        lines = [
            f"问题: {query}",
            "",
            "可引用的需求原文如下:",
        ]
        for idx, source in enumerate(selected, start=1):
            lines.append(f"{idx}. {source.excerpt}")
            lines.append(f"[来源: {source.label}]")

        if not grounded:
            lines.append("")
            lines.append("未找到完整 Markdown 原文, 以上内容来自检索 chunk, 建议等待文档入库完成后重试.")

        answer = "\n".join(lines)
        ai_error = None
        ai_answer = None
        if grounded:
            try:
                ai_answer = await self.ai_service.answer_query(
                    query=query,
                    role=role,
                    source_context=self._source_context(selected),
                )
            except Exception as exc:
                ai_error = str(exc)
                ai_answer = None
            if ai_answer:
                answer = ai_answer

        return RequirementQueryResponse(
            answer=answer,
            sources=[
                RequirementQuerySource(
                    document_id=source.document_id,
                    vector_document_id=source.vector_document_id,
                    filename=source.filename,
                    label=source.label,
                    score=source.score,
                    page_num=source.page_num,
                    chunk_num=source.chunk_num,
                    excerpt=source.excerpt,
                )
                for source in selected
            ],
            is_grounded=bool(grounded),
            message=None if grounded else "Full Markdown original was not available for every source.",
            ai_used=bool(grounded and ai_answer),
            ai_model=self.ai_service.model if grounded and ai_answer else None,
            ai_error=ai_error,
        )

    @staticmethod
    def _source_context(sources: list[_SourceCandidate]) -> str:
        return "\n\n".join(
            f"[来源: {source.label}]\n{source.excerpt}"
            for source in sources
        )
{%- else %}
"""Requirement query service - not configured."""
{%- endif %}
