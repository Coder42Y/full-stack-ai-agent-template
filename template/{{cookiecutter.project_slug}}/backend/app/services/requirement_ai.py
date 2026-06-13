{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
"""LLM adapter for requirement knowledge-base workflows.

The Req KB MVP uses Anthropic Messages-compatible HTTP because the deployment
can point at Anthropic itself or an internal Claude/DeepSeek gateway. The
service is optional at runtime: when credentials are not configured, callers
fall back to deterministic local behavior so generated projects remain
testable without network access.
"""

from __future__ import annotations

import asyncio
import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.core.config import settings


REQUIREMENT_AI_SYSTEM_PROMPT = """你是公司内部需求知识库系统的 AI 需求分析助手。

你的目标是协助产品经理、开发人员理解、澄清、整理和维护需求文档。你必须遵守:
1. 文档为中心:所有结论都应该能落到 Markdown 需求文档,保留用户原始描述和后续澄清。
2. 先澄清再定稿:一句话需求必须主动提出 2-3 个最关键澄清问题,并先生成可讨论的 Markdown 草案。
3. 反幻觉:查询、拆解、变更只能依据用户提供的原文或来源片段;信息不足时明确说不足,不编造。
4. 角色边界:产品可以创建和修改需求;开发以理解、拆解、提建议为主,不能越权直接改需求。
5. 变更保守:小改可直接形成新版本;不确定或影响章节级结构时应说明建议走草稿审批。
6. 输出中文,结构清晰,适合产品、开发和测试直接阅读。

当被要求返回 JSON 时,只返回一个合法 JSON 对象,不要使用 Markdown 代码块。"""


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class RequirementAIIntake:
    """AI-generated one-sentence intake result."""

    markdown_content: str
    clarification_questions: list[str]


@dataclass(frozen=True)
class RequirementAIChange:
    """AI-generated document change result."""

    markdown_content: str
    diff_summary: str


class RequirementAIError(RuntimeError):
    """Raised when the configured LLM endpoint fails or returns invalid data."""


class RequirementAIService:
    """Small Anthropic Messages-compatible client for Req KB workflows."""

    def __init__(self) -> None:
        self.enabled = bool(getattr(settings, "REQUIREMENT_AI_ENABLED", True))
        self.base_url = getattr(settings, "ANTHROPIC_BASE_URL", "https://api.anthropic.com")
        self.token = (
            getattr(settings, "ANTHROPIC_AUTH_TOKEN", "")
            or getattr(settings, "ANTHROPIC_API_KEY", "")
        )
        self.model = (
            getattr(settings, "ANTHROPIC_MODEL", "")
            or getattr(settings, "AI_MODEL", "")
            or "claude-sonnet-4-5"
        )
        self.fallback_models = [
            model
            for model in (
                getattr(settings, "ANTHROPIC_DEFAULT_SONNET_MODEL", ""),
                getattr(settings, "ANTHROPIC_DEFAULT_HAIKU_MODEL", ""),
                getattr(settings, "ANTHROPIC_DEFAULT_OPUS_MODEL", ""),
            )
            if model and model != self.model
        ]
        self.timeout_seconds = float(getattr(settings, "REQUIREMENT_AI_TIMEOUT_SECONDS", 45))

    @property
    def is_configured(self) -> bool:
        return self.enabled and bool(self.base_url and self.token and self.model)

    async def create_from_text(
        self,
        *,
        title: str,
        description: str,
    ) -> RequirementAIIntake | None:
        """Ask the model to create a Markdown draft plus clarification questions."""
        if not self.is_configured:
            return None

        prompt = f"""请把一句话需求整理成可入库的 Markdown 需求草案,并提出 2-3 个关键澄清问题。

需求标题:{title}
一句话描述:{description}

返回 JSON,字段:
- markdown_content: string,必须包含标题、原始描述、业务目标、关键规则草案、待澄清问题、验收草案。
- clarification_questions: string[],2-3 个问题,聚焦上线前必须确认的业务边界。
"""
        data = await self._complete_json(prompt, max_tokens=1800)
        markdown = str(data.get("markdown_content") or "").strip()
        questions = self._string_list(data.get("clarification_questions"))
        if not markdown or not questions:
            raise RequirementAIError("Requirement intake AI returned incomplete JSON.")
        return RequirementAIIntake(
            markdown_content=markdown,
            clarification_questions=questions[:3],
        )

    async def apply_change(
        self,
        *,
        current_markdown: str,
        instruction: str,
    ) -> RequirementAIChange | None:
        """Ask the model to rewrite a requirement document according to an instruction."""
        if not self.is_configured:
            return None

        prompt = f"""请根据修改说明更新需求 Markdown。只能基于原文和修改说明,不要编造未给出的业务规则。

当前 Markdown:
{current_markdown}

修改说明:
{instruction}

返回 JSON,字段:
- markdown_content: string,更新后的完整 Markdown。必须保留原始描述,并把澄清回答或变更内容整理到合适章节。
- diff_summary: string,用中文概括本次变更点。
"""
        data = await self._complete_json(prompt, max_tokens=2600)
        markdown = str(data.get("markdown_content") or "").strip()
        diff_summary = str(data.get("diff_summary") or "").strip()
        if not markdown:
            raise RequirementAIError("Requirement change AI returned empty markdown.")
        return RequirementAIChange(
            markdown_content=markdown,
            diff_summary=diff_summary or "AI 已根据修改说明更新需求文档。",
        )

    async def answer_query(
        self,
        *,
        query: str,
        role: str,
        source_context: str,
    ) -> str | None:
        """Ask the model to answer from cited requirement sources only."""
        if not self.is_configured:
            return None

        prompt = f"""请回答开发或产品提出的需求问题。只能使用下方来源片段中的信息。

当前角色:{role}
问题:
{query}

来源片段:
{source_context}

输出要求:
- 先直接回答问题。
- 每个关键结论后标注对应来源,格式为 [来源: 文档名 > 章节名]。
- 如果来源不足以回答,明确说明缺口,并指出还需要产品澄清什么。
"""
        return await self._complete_text(prompt, max_tokens=1400)

    async def summarize_breakdown(
        self,
        *,
        role: str,
        filename: str,
        source_context: str,
    ) -> str | None:
        """Ask the model to produce a section-level requirement breakdown."""
        if not self.is_configured:
            return None

        prompt = f"""请基于来源片段拆解需求文档,面向当前角色输出。

角色:{role}
文档:{filename}
来源片段:
{source_context}

输出要求:
- 按章节列出业务目标、关键规则、开发实现关注点。
- 如果角色是 tester,额外补充测试关注点。
- 每个拆解点必须标注来源,格式为 [来源: 文档名 > 章节名]。
- 不要引入来源之外的需求。
"""
        return await self._complete_text(prompt, max_tokens=1800)

    async def _complete_json(self, prompt: str, *, max_tokens: int) -> dict[str, Any]:
        text = await self._complete_text(prompt, max_tokens=max_tokens)
        match = _JSON_RE.search(text)
        if not match:
            raise RequirementAIError("AI response did not contain a JSON object.")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise RequirementAIError("AI response JSON could not be decoded.") from exc
        if not isinstance(parsed, dict):
            raise RequirementAIError("AI response JSON must be an object.")
        return parsed

    async def _complete_text(self, prompt: str, *, max_tokens: int) -> str:
        if not self.is_configured:
            raise RequirementAIError("Requirement AI is not configured.")

        errors: list[str] = []
        for model in [self.model, *self.fallback_models]:
            payload = {
                "model": model,
                "max_tokens": max_tokens,
                "system": REQUIREMENT_AI_SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            }
            try:
                text = await asyncio.to_thread(self._post_messages, payload)
            except RequirementAIError as exc:
                errors.append(f"{model}: {exc}")
                continue
            self.model = model
            return text
        raise RequirementAIError("; ".join(errors) or "Requirement AI endpoint request failed.")

    def _post_messages(self, payload: dict[str, Any]) -> str:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self._messages_url(),
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "anthropic-version": "2023-06-01",
                "x-api-key": self.token,
                "Authorization": f"Bearer {self.token}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            message = body[:500] if body else exc.reason
            raise RequirementAIError(
                f"Requirement AI endpoint returned HTTP {exc.code}: {message}"
            ) from exc
        except (TimeoutError, OSError, urllib.error.URLError) as exc:
            raise RequirementAIError("Requirement AI endpoint request failed.") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise RequirementAIError("Requirement AI endpoint returned invalid JSON.") from exc

        content = decoded.get("content", [])
        if isinstance(content, list):
            text_parts = [
                str(part.get("text", ""))
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            text = "\n".join(part for part in text_parts if part).strip()
            if text:
                return text

        if isinstance(decoded.get("completion"), str):
            return decoded["completion"].strip()
        if isinstance(decoded.get("text"), str):
            return decoded["text"].strip()
        raise RequirementAIError("Requirement AI endpoint returned no text content.")

    def _messages_url(self) -> str:
        base = self.base_url.rstrip("/")
        if base.endswith("/v1/messages"):
            return base
        if base.endswith("/v1"):
            return f"{base}/messages"
        return f"{base}/v1/messages"

    @staticmethod
    def _string_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]
{%- else %}
"""Requirement AI service - not configured for this template combination."""
{%- endif %}
