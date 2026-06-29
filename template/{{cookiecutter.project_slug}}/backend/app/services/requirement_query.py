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
    section_title: str | None
    label: str
    score: float
    page_num: int | None
    chunk_num: int | None
    excerpt: str
    from_markdown: bool
    retrieval_path: str


def _compact(text: str, *, limit: int = 700) -> str:
    """Normalize source text for compact API output."""
    compacted = _SPACE_RE.sub(" ", text).strip()
    if len(compacted) <= limit:
        return compacted
    return compacted[: limit - 3].rstrip() + "..."


def _source_label(
    filename: str,
    page_num: int | None,
    chunk_num: int | None,
    section_title: str | None = None,
) -> str:
    parts = [filename]
    if section_title:
        parts.append(section_title)
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


def _query_variants(query: str) -> list[str]:
    """Generate short deterministic recall queries without asking the model."""
    variants = [_compact(query, limit=180)]
    tokens = [
        token
        for token in _tokens(query)
        if len(token) > 1 and token not in {"请问", "什么", "哪些", "怎么", "如何"}
    ]
    if tokens:
        variants.append(" ".join(tokens[:10]))
    return list(dict.fromkeys(variant for variant in variants if variant))[:3]


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


def _best_markdown_excerpt(query: str, markdown: str) -> tuple[str | None, str, float]:
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
    return best_title, _compact(best_body), max(best_score, 0.0)


def _locate_markdown_evidence(
    query: str,
    markdown: str,
    chunk_text: str,
    *,
    limit: int = 700,
) -> tuple[str | None, str, float]:
    """Locate the strongest original Markdown evidence around a retrieved chunk."""
    if not markdown.strip():
        return None, _compact(chunk_text, limit=limit), 0.0

    needle = _compact(chunk_text, limit=180).lower()
    for title, body in _markdown_sections(markdown):
        body_compact = _compact(body, limit=len(body))
        if needle and needle in body_compact.lower():
            return title, _compact(body, limit=limit), max(0.8, _markdown_score(query, body))

    return _best_markdown_excerpt(query, markdown)


def _merge_sources(sources: list[_SourceCandidate], *, limit: int) -> list[_SourceCandidate]:
    """Merge duplicate evidence while preferring grounded Markdown excerpts."""
    merged: dict[tuple[str, str | None, int | None], _SourceCandidate] = {}
    for source in sources:
        key = (
            source.document_id,
            source.section_title or source.label,
            None if source.section_title else source.chunk_num,
        )
        current = merged.get(key)
        if current is None:
            merged[key] = source
            continue
        if (source.from_markdown, source.score) > (current.from_markdown, current.score):
            merged[key] = source
    ordered = sorted(
        merged.values(),
        key=lambda source: (
            source.from_markdown,
            source.retrieval_path == "vector+markdown",
            source.score,
        ),
        reverse=True,
    )
    return ordered[:limit]


def _grounding_status(
    sources: list[_SourceCandidate],
) -> tuple[str, str, bool]:
    """Return grounding status, confidence, and legacy is_grounded flag."""
    if not sources:
        return "no_source", "low", False
    grounded = [source for source in sources if source.from_markdown]
    if not grounded:
        return "low_confidence", "low", False
    best_score = max(source.score for source in grounded)
    if best_score >= 0.7:
        return "grounded", "high", True
    if best_score >= 0.35 or len(grounded) >= 2:
        return "partial", "medium", True
    return "partial", "medium", True


def _facts_from_sources(sources: list[_SourceCandidate]) -> list[str]:
    """Build source-backed facts for machine-readable UI display."""
    return [
        f"{source.excerpt} [来源: {source.label}]"
        for source in sources[:3]
        if source.from_markdown and source.excerpt
    ]


def _inferences_for_status(status: str, sources: list[_SourceCandidate]) -> list[str]:
    if status == "grounded":
        return []
    if status == "partial":
        return ["当前来源只能支撑部分结论, 未覆盖的问题需要产品继续确认。"]
    if status == "low_confidence" and sources:
        return ["检索命中了可能相关的 chunk, 但没有完整原文可校验, 不能作为确定需求结论。"]
    return []


def _follow_up_questions(query: str, status: str, role: str) -> list[str]:
    if status == "grounded":
        return []
    role_hint = "产品" if role in {"product", "admin"} else "产品负责人"
    return [
        f"请{role_hint}确认: “{_compact(query, limit=80)}” 对应的原文章节或需求版本是哪一个?",
        "是否需要补充 PRD 原文、澄清记录或最新版本变更说明?",
    ]


def _tester_focus_from_sources(sources: list[_SourceCandidate], role: str) -> list[str]:
    """Build source-bound tester notes without inventing additional requirements."""
    if role != "tester":
        return []
    focus: list[str] = []
    for source in sources:
        if not source.from_markdown or not source.excerpt:
            continue
        scope = source.section_title or source.filename
        focus.append(
            f"围绕“{scope}”设计正向、边界和异常用例, 断言必须能回溯到来源: {source.label}。"
        )
        if len(focus) >= 3:
            break
    if focus:
        focus.append("缺少原文覆盖的规则需要标记为待产品确认, 不能作为已确认测试结论。")
    return focus


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
        """Run multi-recall retrieval and answer from original Markdown evidence."""
        sources: list[_SourceCandidate] = []
        seen: set[tuple[str | None, int | None, str]] = set()
        query_variants = _query_variants(query)
        debug = {
            "query_variants": query_variants,
            "vector_hits": 0,
            "markdown_hits": 0,
        }

        if self.retrieval_service is not None:
            for variant in query_variants:
                try:
                    hits = await self.retrieval_service.retrieve(
                        query=variant,
                        collection_name=collection_name,
                        limit=max(limit, 5),
                        min_score=min_score,
                        use_reranker=True,
                    )
                except Exception:
                    hits = []
                debug["vector_hits"] += len(hits)

                for hit in hits:
                    key = (hit.parent_doc_id, hit.metadata.get("chunk_num"), variant)
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
                    section_title, excerpt, section_score = _locate_markdown_evidence(
                        query,
                        markdown,
                        hit.content,
                    )
                    score = max(float(hit.score), section_score)
                    sources.append(
                        _SourceCandidate(
                            document_id=str(getattr(doc, "id", hit.parent_doc_id or "")),
                            vector_document_id=hit.parent_doc_id,
                            filename=filename,
                            section_title=section_title,
                            label=_source_label(filename, page_num, chunk_num, section_title),
                            score=score,
                            page_num=page_num,
                            chunk_num=chunk_num,
                            excerpt=excerpt,
                            from_markdown=bool(markdown),
                            retrieval_path="vector+markdown" if markdown else "vector",
                        )
                    )

        for variant in query_variants:
            markdown_sources = await self._markdown_fallback(
                kb_id=kb_id,
                collection_name=collection_name,
                query=variant,
                limit=limit,
                seen_doc_ids=set(),
            )
            debug["markdown_hits"] += len(markdown_sources)
            sources.extend(markdown_sources)

        selected = _merge_sources(sources, limit=limit)

        return await self._build_response(
            query=query,
            role=role,
            sources=selected,
            retrieval_debug=debug,
        )

    async def query_collections(
        self,
        *,
        collection_names: list[str],
        query: str,
        role: str = "developer",
        limit: int = 5,
        min_score: float = 0.0,
    ) -> RequirementQueryResponse:
        """Grounded query helper for agent tools that only know collection names."""
        sources: list[_SourceCandidate] = []
        debug = {"query_variants": _query_variants(query), "vector_hits": 0, "markdown_hits": 0}

        for collection_name in collection_names:
            docs = await rag_document_repo.get_latest_markdown_for_collection(
                self.db,
                collection_name=collection_name,
            )
            for doc in docs:
                markdown = doc.markdown_content or ""
                score = _markdown_score(query, markdown)
                if score <= 0:
                    continue
                section_title, excerpt, section_score = _best_markdown_excerpt(query, markdown)
                sources.append(
                    _SourceCandidate(
                        document_id=str(doc.id),
                        vector_document_id=doc.vector_document_id,
                        filename=doc.filename,
                        section_title=section_title,
                        label=_source_label(doc.filename, None, None, section_title),
                        score=max(score, section_score),
                        page_num=None,
                        chunk_num=None,
                        excerpt=excerpt,
                        from_markdown=True,
                        retrieval_path="markdown",
                    )
                )
        debug["markdown_hits"] = len(sources)
        return await self._build_response(
            query=query,
            role=role,
            sources=_merge_sources(sources, limit=limit),
            retrieval_debug=debug,
        )

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
            section_title, excerpt, section_score = _best_markdown_excerpt(query, markdown)
            candidates.append(
                _SourceCandidate(
                    document_id=str(doc.id),
                    vector_document_id=doc.vector_document_id,
                    filename=doc.filename,
                    section_title=section_title,
                    label=_source_label(doc.filename, None, None, section_title),
                    score=max(score, section_score),
                    page_num=None,
                    chunk_num=None,
                    excerpt=excerpt,
                    from_markdown=True,
                    retrieval_path="markdown",
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
        retrieval_debug: dict[str, Any] | None = None,
    ) -> RequirementQueryResponse:
        status, confidence, is_grounded = _grounding_status(sources)
        facts = _facts_from_sources(sources)
        inferences = _inferences_for_status(status, sources)
        follow_up_questions = _follow_up_questions(query, status, role)
        test_focus = _tester_focus_from_sources(sources, role)

        if not sources:
            return RequirementQueryResponse(
                answer=(
                    "未找到可精确引用的原文, 不能把该问题回答为确定需求结论。\n\n"
                    "待确认问题:\n- " + "\n- ".join(follow_up_questions)
                ),
                sources=[],
                is_grounded=is_grounded,
                grounding_status=status,
                confidence=confidence,
                facts=facts,
                inferences=inferences,
                follow_up_questions=follow_up_questions,
                test_focus=test_focus,
                retrieval_debug=retrieval_debug,
                message="No precise source found.",
            )

        grounded = [source for source in sources if source.from_markdown]
        selected = grounded or sources
        lines = [
            f"问题: {query}",
            "",
            "已确认信息:",
        ]
        if facts:
            lines.extend(f"- {fact}" for fact in facts)
        else:
            lines.append("- 暂无完整原文可支撑的确定结论。")

        if inferences:
            lines.extend(["", "谨慎推断:"])
            lines.extend(f"- {item}" for item in inferences)

        if follow_up_questions:
            lines.extend(["", "待确认问题:"])
            lines.extend(f"- {item}" for item in follow_up_questions)

        if test_focus:
            lines.extend(["", "测试关注点:"])
            lines.extend(f"- {item}" for item in test_focus)

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
            if ai_answer and "[来源:" in ai_answer:
                answer = ai_answer
            elif ai_answer:
                ai_error = "AI answer was ignored because it did not cite provided sources."

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
            is_grounded=is_grounded,
            grounding_status=status,
            confidence=confidence,
            facts=facts,
            inferences=inferences,
            follow_up_questions=follow_up_questions,
            test_focus=test_focus,
            retrieval_debug=retrieval_debug,
            message=None if grounded else "Full Markdown original was not available for every source.",
            ai_used=bool(grounded and ai_answer and "[来源:" in ai_answer),
            ai_model=self.ai_service.model if grounded and ai_answer and "[来源:" in ai_answer else None,
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
