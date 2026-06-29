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
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.services.ai_runtime_config import get_ai_runtime_config


REQUIREMENT_AI_SYSTEM_PROMPT = """你是公司内部需求知识库系统的 AI 需求分析引擎。

你的任务是把产品输入、来源文档、澄清记录和变更说明转化为可追溯的需求内容。你服务产品、开发和测试三类协作者:
- 面向产品:保留原始意图,补齐业务目标、范围、用户角色、业务规则、异常和验收标准。
- 面向开发:把需求拆成实现关注点,包括接口/数据、状态流转、权限、边界条件、兼容性和待确认问题。
- 面向测试:提炼验收场景、反例、边界值、回归影响和未决风险。

硬性规则:
1. 文档为中心:新增、查询、拆解和变更都必须能回到 Markdown 需求文档或用户给出的来源片段。
2. 保留原意:生成或改写 Markdown 时必须保留用户原始描述,不要删除未被要求修改的需求内容。
3. 先澄清再定稿:一句话需求只生成可讨论草案,并提出 2-3 个上线前最关键澄清问题。
4. 反幻觉:不能编造不存在的接口、字段、业务规则、验收标准、负责人、排期或版本状态。
5. 角色边界:产品/admin 可以创建和修改需求;开发/tester 只能查询、拆解和提出建议,不能直接替产品确认需求。
6. 变更保守:小范围文字或规则补充可以形成新版本;影响主流程、权限、数据模型、验收口径或跨模块行为时,应建议走草稿审批并说明影响面。
7. 证据优先:来源不足时直接说明缺口,列出需要产品确认的问题,不要用通用经验补齐事实。

输出要求:
- 默认输出中文,结构清晰,能被产品、开发和测试直接使用。
- 查询和拆解必须标注来源,并把“已确认信息”和“待确认问题”分开。
- 当被要求返回 JSON 时,只返回一个合法 JSON 对象,不要使用 Markdown 代码块、解释文字或额外前后缀。"""


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

    def __init__(
        self,
        *,
        model_override: str | None = None,
        thinking_effort_override: str | None = None,
    ) -> None:
        runtime_config = get_ai_runtime_config()
        self.enabled = bool(getattr(settings, "REQUIREMENT_AI_ENABLED", True))
        self.base_url = runtime_config.base_url or getattr(
            settings, "ANTHROPIC_BASE_URL", "https://api.anthropic.com"
        )
        self.token = (
            getattr(settings, "ANTHROPIC_AUTH_TOKEN", "")
            or getattr(settings, "ANTHROPIC_API_KEY", "")
        )
        available_models = {model.id for model in runtime_config.models}
        requested_model = (model_override or "").strip()
        self.model = (
            requested_model if requested_model and requested_model in available_models else ""
        ) or (
            runtime_config.effective_model
            or runtime_config.model
            or getattr(settings, "ANTHROPIC_MODEL", "")
            or getattr(settings, "ANTHROPIC_DEFAULT_SONNET_MODEL", "")
            or getattr(settings, "ANTHROPIC_REASONING_MODEL", "")
            or getattr(settings, "ANTHROPIC_DEFAULT_HAIKU_MODEL", "")
            or getattr(settings, "ANTHROPIC_DEFAULT_OPUS_MODEL", "")
            or getattr(settings, "AI_MODEL", "")
            or "claude-sonnet-4-5"
        )
        runtime_models = [model.id for model in runtime_config.models]
        self.fallback_models = [
            model
            for model in (
                getattr(settings, "ANTHROPIC_DEFAULT_SONNET_MODEL", ""),
                getattr(settings, "ANTHROPIC_DEFAULT_HAIKU_MODEL", ""),
                getattr(settings, "ANTHROPIC_DEFAULT_OPUS_MODEL", ""),
                getattr(settings, "ANTHROPIC_REASONING_MODEL", ""),
                *runtime_models,
            )
            if model and model != self.model
        ]
        self.temperature = runtime_config.temperature
        requested_effort = (thinking_effort_override or "").strip()
        self.thinking_effort = (
            requested_effort
            if requested_effort in {"off", "low", "medium", "high"}
            else runtime_config.thinking_effort
        )
        self.max_tokens = runtime_config.max_tokens
        self.timeout_seconds = float(getattr(settings, "REQUIREMENT_AI_TIMEOUT_SECONDS", 45))

    @property
    def is_configured(self) -> bool:
        return self.enabled and bool(self.base_url and self.token and self.token != "dummy" and self.model)

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
- markdown_content: string,必须包含标题、原始描述、业务目标、用户/角色、范围边界、关键规则草案、异常/边界、待澄清问题、验收草案。未知内容写“待确认”,不要编造。
- clarification_questions: string[],2-3 个问题,只问上线前必须确认且会影响开发/测试的问题。
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
- markdown_content: string,更新后的完整 Markdown。必须保留未被要求修改的原文,并把澄清回答或变更内容整理到合适章节;不确定内容标为“待确认”。
- diff_summary: string,用中文概括本次变更点、影响章节和需要产品确认的风险。
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

        prompt = f"""请回答产品、开发或测试提出的需求问题。只能使用下方来源片段中的信息。

当前角色:{role}
问题:
{query}

来源片段:
{source_context}

输出要求:
- 先直接回答问题,再列依据和待确认问题。
- 面向产品时突出业务口径、范围和验收;面向开发时突出接口/数据/状态/权限/异常;面向测试时突出场景、边界和回归风险。
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
- 按章节列出业务目标、关键规则、接口/数据关注点、状态/权限/异常流程、测试关注点和待确认问题。
- 如果角色是 product,突出业务口径和验收标准;如果角色是 developer,突出实现拆解和依赖;如果角色是 tester,突出测试场景和边界。
- 每个拆解点必须标注来源,格式为 [来源: 文档名 > 章节名]。
- 不要引入来源之外的需求。
"""
        return await self._complete_text(prompt, max_tokens=1800)

    async def complete_chat(
        self,
        *,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int = 1800,
    ) -> str | None:
        """Complete a normal chat turn through the configured Anthropic-compatible gateway."""
        if not self.is_configured:
            return None
        normalized_messages = [
            {"role": message["role"], "content": message["content"]}
            for message in messages
            if message.get("role") in {"user", "assistant"} and str(message.get("content") or "").strip()
        ]
        if not normalized_messages:
            raise RequirementAIError("Chat AI request has no messages.")
        return await self._complete_messages(
            system_prompt=system_prompt,
            messages=normalized_messages,
            max_tokens=max(max_tokens, self.max_tokens),
        )

    async def stream_chat(
        self,
        *,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int = 1800,
    ) -> AsyncIterator[str]:
        """Stream a normal chat turn through the configured gateway."""
        if not self.is_configured:
            return
        normalized_messages = [
            {"role": message["role"], "content": message["content"]}
            for message in messages
            if message.get("role") in {"user", "assistant"} and str(message.get("content") or "").strip()
        ]
        if not normalized_messages:
            raise RequirementAIError("Chat AI request has no messages.")
        async for chunk in self._stream_messages(
            system_prompt=system_prompt,
            messages=normalized_messages,
            max_tokens=max(max_tokens, self.max_tokens),
        ):
            yield chunk

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

        return await self._complete_messages(
            system_prompt=REQUIREMENT_AI_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
        )

    async def _complete_messages(
        self,
        *,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> str:
        errors: list[str] = []
        for model in [self.model, *self.fallback_models]:
            payload = self._build_messages_payload(
                model=model,
                system_prompt=system_prompt,
                messages=messages,
                max_tokens=max_tokens,
            )
            try:
                text = await asyncio.to_thread(self._post_messages, payload)
            except RequirementAIError as exc:
                if "thinking" in payload or "reasoning_effort" in payload:
                    retry_payload = {
                        key: value
                        for key, value in payload.items()
                        if key not in {"thinking", "reasoning_effort"}
                    }
                    try:
                        text = await asyncio.to_thread(self._post_messages, retry_payload)
                    except RequirementAIError as retry_exc:
                        errors.append(f"{model}: {exc}; no-thinking retry: {retry_exc}")
                        continue
                    self.model = model
                    return text
                errors.append(f"{model}: {exc}")
                continue
            self.model = model
            return text
        raise RequirementAIError("; ".join(errors) or "Requirement AI endpoint request failed.")

    async def _stream_messages(
        self,
        *,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> AsyncIterator[str]:
        errors: list[str] = []
        for model in [self.model, *self.fallback_models]:
            payload = self._build_messages_payload(
                model=model,
                system_prompt=system_prompt,
                messages=messages,
                max_tokens=max_tokens,
            )
            payload["stream"] = True
            yielded = False
            try:
                async for chunk in self._run_streaming_request(payload):
                    yielded = True
                    yield chunk
            except RequirementAIError as exc:
                if yielded:
                    raise
                if "thinking" in payload or "reasoning_effort" in payload:
                    retry_payload = {
                        key: value
                        for key, value in payload.items()
                        if key not in {"thinking", "reasoning_effort"}
                    }
                    retry_yielded = False
                    try:
                        async for chunk in self._run_streaming_request(retry_payload):
                            retry_yielded = True
                            yield chunk
                    except RequirementAIError as retry_exc:
                        if retry_yielded:
                            raise
                        errors.append(f"{model}: {exc}; no-thinking retry: {retry_exc}")
                        continue
                    if retry_yielded:
                        self.model = model
                        return
                    errors.append(f"{model}: stream returned no text")
                    continue
                errors.append(f"{model}: {exc}")
                continue
            if yielded:
                self.model = model
                return
            errors.append(f"{model}: stream returned no text")
        raise RequirementAIError("; ".join(errors) or "Requirement AI endpoint stream failed.")

    def _build_messages_payload(
        self,
        *,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> dict[str, Any]:
        thinking_budget = self._thinking_budget_tokens()
        request_max_tokens = max(max_tokens, thinking_budget + 512) if thinking_budget else max_tokens
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": request_max_tokens,
            "system": system_prompt,
            "messages": messages,
        }
        if self.temperature is not None:
            payload["temperature"] = self.temperature
        if self.thinking_effort == "off" and self._supports_thinking_toggle(model):
            payload["thinking"] = {"type": "disabled"}
        elif self.thinking_effort != "off":
            payload["thinking"] = {"type": "enabled"}
            if thinking_budget:
                payload["thinking"]["budget_tokens"] = thinking_budget
            if self._supports_reasoning_effort(model):
                payload["reasoning_effort"] = self.thinking_effort
        return payload

    def _thinking_budget_tokens(self) -> int:
        return {
            "low": 1024,
            "medium": 2048,
            "high": 4096,
        }.get(self.thinking_effort, 0)

    @staticmethod
    def _supports_reasoning_effort(model: str) -> bool:
        return model.lower().startswith("glm-5")

    @staticmethod
    def _supports_thinking_toggle(model: str) -> bool:
        return model.lower().startswith("glm-")

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

    async def _run_streaming_request(self, payload: dict[str, Any]) -> AsyncIterator[str]:
        queue: asyncio.Queue[object] = asyncio.Queue()
        done = object()
        loop = asyncio.get_running_loop()

        def worker() -> None:
            try:
                for chunk in self._post_messages_stream(payload):
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, exc)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, done)

        task = asyncio.create_task(asyncio.to_thread(worker))
        try:
            while True:
                item = await queue.get()
                if item is done:
                    break
                if isinstance(item, Exception):
                    raise item
                yield str(item)
        finally:
            await task

    def _post_messages_stream(self, payload: dict[str, Any]) -> Iterator[str]:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self._messages_url(),
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
                "anthropic-version": "2023-06-01",
                "x-api-key": self.token,
                "Authorization": f"Bearer {self.token}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line or line.startswith(":") or line.startswith("event:"):
                        continue
                    if not line.startswith("data:"):
                        continue
                    data_line = line.removeprefix("data:").strip()
                    if data_line == "[DONE]":
                        break
                    try:
                        decoded = json.loads(data_line)
                    except json.JSONDecodeError:
                        continue
                    text = self._stream_text_from_event(decoded)
                    if text:
                        yield text
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            message = body[:500] if body else exc.reason
            raise RequirementAIError(
                f"Requirement AI endpoint returned HTTP {exc.code}: {message}"
            ) from exc
        except (TimeoutError, OSError, urllib.error.URLError) as exc:
            raise RequirementAIError("Requirement AI endpoint stream failed.") from exc

    @staticmethod
    def _stream_text_from_event(event: Any) -> str:
        if not isinstance(event, dict):
            return ""

        delta = event.get("delta")
        if isinstance(delta, dict):
            text = delta.get("text") or delta.get("content")
            if isinstance(text, str):
                return text

        content_block = event.get("content_block")
        if isinstance(content_block, dict) and isinstance(content_block.get("text"), str):
            return content_block["text"]

        choices = event.get("choices")
        if isinstance(choices, list) and choices:
            choice = choices[0]
            if isinstance(choice, dict):
                choice_delta = choice.get("delta")
                if isinstance(choice_delta, dict) and isinstance(choice_delta.get("content"), str):
                    return choice_delta["content"]
                if isinstance(choice.get("text"), str):
                    return choice["text"]

        content = event.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(
                str(part.get("text", ""))
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            )
        return ""

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
