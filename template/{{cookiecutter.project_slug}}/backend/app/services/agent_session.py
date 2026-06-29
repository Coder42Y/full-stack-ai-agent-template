{%- if cookiecutter.use_pydantic_ai %}
"""Per-connection AI agent session (PydanticAI).

Encapsulates the orchestration that used to live in the WebSocket route:
  - holds per-connection state (history, deps, current conversation id)
  - persists user/assistant turns via shared service helpers
  - streams PydanticAI agent events back to the client over the WebSocket

The route is left as a thin lifecycle wrapper that just feeds incoming messages to
``AgentSession.process_message``.
"""

import logging
import re
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from pydantic_ai import (
    Agent,
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPartDelta,
    ToolCallPartDelta,
)
from pydantic_ai.messages import BinaryContent, TextPart, ThinkingPart, ThinkingPartDelta

from app.agents.assistant import Deps, get_agent
from app.services.agent import (
    build_message_history,
{%- if cookiecutter.use_database %}
    persist_assistant_turn,
    persist_user_turn,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    resolve_kb_collections,
{%- endif %}
    send_event,
)
{%- if cookiecutter.websocket_auth_jwt %}
from app.db.models.user import User
{%- endif %}
{%- if (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.api.deps import get_conversation_service
from app.db.session import get_db_context{% if cookiecutter.use_sqlite %}, get_db_session
from contextlib import contextmanager{% endif %}
from app.services.file_storage import get_file_storage
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.services.requirement_ai import RequirementAIService
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.services.usage import UsageService
{%- endif %}

logger = logging.getLogger(__name__)


_GREETING_RE = re.compile(
    r"^\s*(你好|您好|hello|hi|hey|在吗|哈喽|嗨|早上好|下午好|晚上好)[!\u3002.\s]*$",
    re.IGNORECASE,
)
_HELP_RE = re.compile(r"(你能做什么|怎么用|帮助|help|功能|使用说明|可以做什么)", re.IGNORECASE)
_QUERY_RE = re.compile(r"(查询|查一下|查下|找一下|有没有|是什么|哪些|多少|根据|基于|来源|引用|PRD|文档)")
_INTAKE_RE = re.compile(r"(新需求|创建需求|录入需求|一句话需求|帮我写需求|需求是|想做|需要支持)")
_BREAKDOWN_RE = re.compile(r"(拆解|开发点|实现点|测试点|验收|测试用例|边界条件)")
_CHANGE_RE = re.compile(r"(变更|修改|改一下|调整|建议增加|建议修改|优化|删掉|移除)")


def _classify_chat_intent(message: str, intent_hint: str | None = None) -> str:
    """Classify common chat turns before invoking the LLM."""
    if intent_hint in {"intake", "query", "breakdown", "change", "test", "general"}:
        return intent_hint
    text = message.strip()
    if not text:
        return "empty"
    if _GREETING_RE.search(text):
        return "greeting"
    if _HELP_RE.search(text):
        return "help"
    if _CHANGE_RE.search(text):
        return "change"
    if _BREAKDOWN_RE.search(text):
        return "breakdown"
    if _INTAKE_RE.search(text):
        return "intake"
    if _QUERY_RE.search(text):
        return "query"
    if len(text) <= 8 and "?" not in text and "\uff1f" not in text:
        return "general"
    return "agent"


def _chat_actions(intent: str) -> list[dict[str, Any]]:
    """Return UI actions that keep lightweight turns product-aware."""
    base_actions = [
        {
            "id": "open-kb",
            "label": "打开需求工作台",
            "kind": "navigate",
            "href": "/kb",
        },
        {
            "id": "open-chat-settings",
            "label": "选择知识库",
            "kind": "select_kb",
        },
    ]
    if intent == "query":
        return [
            {
                "id": "open-kb",
                "label": "查看需求项目",
                "kind": "navigate",
                "href": "/kb",
            },
            {
                "id": "select-kb",
                "label": "选择要查询的知识库",
                "kind": "select_kb",
            },
        ]
    if intent == "intake":
        return [
            {
                "id": "open-intake",
                "label": "去工作台录入需求",
                "kind": "open_workbench",
                "href": "/kb",
                "payload": {"mode": "intake"},
            },
            {
                "id": "upload-source",
                "label": "先上传来源文档",
                "kind": "upload",
                "href": "/kb",
            },
        ]
    if intent in {"breakdown", "change", "test"}:
        return [
            {
                "id": "open-kb",
                "label": "选择需求文档",
                "kind": "open_workbench",
                "href": "/kb",
                "payload": {"mode": intent},
            },
            {
                "id": "select-kb",
                "label": "切换知识库",
                "kind": "select_kb",
            },
        ]
    return base_actions


class AgentSession:
    """One WebSocket session with the AI agent."""

    def __init__(
        self,
        websocket: WebSocket,
{%- if cookiecutter.websocket_auth_jwt %}
        user: User,
{%- endif %}
    ) -> None:
        self.websocket = websocket
{%- if cookiecutter.websocket_auth_jwt %}
        self.user = user
{%- endif %}
        self.conversation_history: list[dict[str, str]] = []
        self.deps = Deps()
{%- if cookiecutter.use_database %}
        self.current_conversation_id: str | None = None
{%- endif %}

    async def process_message(self, data: dict[str, Any]) -> None:
        """Process one user turn: persist input, run the agent, stream events, persist output."""
        user_message = data.get("message", "")
        file_ids = data.get("file_ids", [])
        intent = _classify_chat_intent(user_message, data.get("intent_hint"))

        if not user_message and not file_ids:
            await send_event(self.websocket, "error", {"message": "Empty message"})
            return

{%- if cookiecutter.use_database %}
        self.current_conversation_id, newly_created, organization_id = await persist_user_turn(
{%- if cookiecutter.websocket_auth_jwt %}
            self.user,
{%- endif %}
            user_message,
            file_ids,
            requested_conversation_id=data.get("conversation_id"),
            current_conversation_id=self.current_conversation_id,
        )
        if newly_created and self.current_conversation_id:
            await send_event(
                self.websocket,
                "conversation_created",
                {"conversation_id": self.current_conversation_id},
            )
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
        await self._reload_conversation_history()
{%- endif %}
{%- endif %}

        await send_event(self.websocket, "user_prompt", {"content": user_message})
        await send_event(
            self.websocket,
            "assistant_status",
            {
                "mode": "workflow" if intent in {"intake", "query", "breakdown", "change", "test"} else "ai",
                "intent": intent,
                "message": self._status_message(intent),
            },
        )

        handled = await self._maybe_handle_lightweight_turn(user_message, intent)
        if handled:
            return

        try:
{%- if (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
            user_input = await self._build_multimodal_input(user_message, file_ids)
{%- else %}
            user_input = user_message
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
            self.deps.kb_collection_names = await resolve_kb_collections(
{%- if cookiecutter.use_database %}
                self.current_conversation_id,
{%- else %}
                None,
{%- endif %}
{%- if cookiecutter.websocket_auth_jwt %}
{%- if cookiecutter.use_postgresql %}
                self.user.id,
{%- else %}
                str(self.user.id),
{%- endif %}
{%- endif %}
                override_kb_ids=(
                    [str(i) for i in (data.get("active_knowledge_base_ids") or [])]
                    if "active_knowledge_base_ids" in data and isinstance(data.get("active_knowledge_base_ids"), list)
                    else None
                ),
{%- if cookiecutter.enable_teams and cookiecutter.use_database %}
                organization_id=str(organization_id) if organization_id else None,
{%- endif %}
            )
{%- endif %}

            if await self._maybe_handle_grounded_query(user_message, intent):
                return

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
            if await self._maybe_handle_gateway_chat(user_message, user_input, intent, data):
                return

{%- endif %}
            assistant = get_agent(
                model_name=data.get("model"),
                thinking_effort=data.get("thinking_effort"),
            )
            model_history = build_message_history(self.conversation_history)
            collected_tool_calls: list[dict[str, Any]] = []
            async with assistant.agent.iter(
                user_input, deps=self.deps, message_history=model_history
            ) as agent_run:
                await self._stream_agent_run(agent_run, user_message, collected_tool_calls)

            # Update in-memory history only after a complete agent run
            if agent_run.result is not None:
                self.conversation_history.append({"role": "user", "content": user_message})
                self.conversation_history.append(
                    {"role": "assistant", "content": agent_run.result.output}
                )

{%- if cookiecutter.use_database %}
            assistant_msg_id: str | None = None
            if self.current_conversation_id and agent_run.result is not None:
                assistant_msg_id = await persist_assistant_turn(
                    self.current_conversation_id,
                    agent_run.result.output,
                    getattr(assistant, "model_name", None),
                    collected_tool_calls,
                )

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
            # Record usage + debit credits (best-effort).
            if agent_run.result is not None and organization_id:
                await self._record_usage(
                    agent_run=agent_run,
                    assistant=assistant,
                    organization_id=organization_id,
                )
{%- endif %}

            if assistant_msg_id:
                await send_event(
                    self.websocket,
                    "message_saved",
                    {
                        "message_id": assistant_msg_id,
                        "conversation_id": self.current_conversation_id,
                    },
                )

            await send_event(
                self.websocket,
                "complete",
                {"conversation_id": self.current_conversation_id},
            )
{%- else %}
            await send_event(self.websocket, "complete", {})
{%- endif %}
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.exception(f"Error processing agent request: {e}")
            await self._send_offline_assistant_response(user_message, intent, str(e))

    @staticmethod
    def _status_message(intent: str) -> str:
        messages = {
            "greeting": "轻量对话",
            "help": "功能导航",
            "intake": "需求录入",
            "query": "需求查询",
            "breakdown": "需求拆解",
            "change": "变更建议",
            "test": "测试分析",
            "general": "普通说明",
        }
        return messages.get(intent, "AI 对话")

    async def _maybe_handle_lightweight_turn(self, user_message: str, intent: str) -> bool:
        """Handle turns that should not spend a model call."""
        if intent == "greeting":
            output = (
                "你好, 我在. 你可以直接把需求想法、PRD 问题、开发拆解或变更建议发给我; "
                "如果要基于文档回答, 先在右下角选择对应知识库."
            )
            await self._send_workflow_reply(
                output=output,
                intent=intent,
                title="需求协作助手",
                summary="可帮你录入需求、查询 PRD、拆解开发/测试关注点和整理变更建议.",
                actions=_chat_actions(intent),
            )
            return True

        if intent == "help":
            output = (
                "我可以做四类事:\n"
                "- 录入一句话需求, 并追问关键业务边界.\n"
                "- 基于选中的知识库查询 PRD, 并标注来源.\n"
                "- 拆解开发实现点、测试验收点和待确认问题.\n"
                "- 把修改诉求整理成变更建议, 避免直接改动正式需求."
            )
            await self._send_workflow_reply(
                output=output,
                intent=intent,
                title="可以从这些入口开始",
                summary="选择知识库后, 查询和拆解会更准确; 没有来源时我会明确提示缺少依据.",
                actions=_chat_actions(intent),
            )
            return True

        return False

    async def _maybe_handle_grounded_query(self, user_message: str, intent: str) -> bool:
        """Answer requirement queries through the deterministic grounded query service."""
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_postgresql %}
        if intent != "query":
            return False
        if not self.deps.kb_collection_names:
            await self._send_workflow_reply(
                output=(
                    "当前还没有选中知识库, 我不能把这个问题回答成确定需求结论. "
                    "请先选择需求项目或上传来源文档, 然后再问一次."
                ),
                intent=intent,
                title="需要先选择知识库",
                summary="有选中的来源后, 我会基于原文回答并标注来源.",
                actions=_chat_actions(intent),
            )
            return True

        from app.services.requirement_query import RequirementQueryService

        async with get_db_context() as db:
            response = await RequirementQueryService(db).query_collections(
                collection_names=self.deps.kb_collection_names,
                query=user_message,
                role="developer",
                limit=5,
            )
        await self._send_workflow_reply(
            output=response.answer,
            intent=intent,
            title="已基于知识库查询",
            summary=(
                f"Grounding: {response.grounding_status}; "
                f"confidence: {response.confidence}; sources: {len(response.sources)}"
            ),
            actions=_chat_actions(intent),
        )
        return True
{%- else %}
        return False
{%- endif %}

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
    async def _maybe_handle_gateway_chat(
        self,
        user_message: str,
        user_input: str | list[Any],
        intent: str,
        data: dict[str, Any],
    ) -> bool:
        """Use the configured Anthropic-compatible gateway for normal chat turns."""
        gateway = RequirementAIService(
            model_override=str(data.get("model") or "") or None,
            thinking_effort_override=str(data.get("thinking_effort") or "") or None,
        )
        if not gateway.is_configured or not isinstance(user_input, str):
            return False

        from app.agents.prompts import get_system_prompt_with_rag

        await send_event(self.websocket, "model_request_start", {})
        output_parts: list[str] = []
        async for chunk in gateway.stream_chat(
            system_prompt=get_system_prompt_with_rag(),
            messages=[
                *self.conversation_history[-8:],
                {"role": "user", "content": user_input},
            ],
            max_tokens=1800,
        ):
            output_parts.append(chunk)
            await send_event(
                self.websocket,
                "text_delta",
                {"index": len(output_parts) - 1, "content": chunk},
            )
        output = "".join(output_parts).strip()
        if not output:
            return False

        await self._send_model_reply(
            output=output,
            model_name=gateway.model,
            tool_calls=[],
            complete_payload={
{%- if cookiecutter.use_database %}
                "conversation_id": self.current_conversation_id,
{%- endif %}
                "mode": "ai",
                "intent": intent,
            },
            streamed=True,
        )
        self.conversation_history.append({"role": "user", "content": user_message})
        self.conversation_history.append({"role": "assistant", "content": output})
        return True

    async def _reload_conversation_history(self) -> None:
        """Reload recent persisted turns so runtime model switches keep conversation context."""
        if not self.current_conversation_id:
            return
        try:
            async with get_db_context() as db:
                conversation_service = get_conversation_service(db)
                messages, _ = await conversation_service.list_messages(
                    self.current_conversation_id,
                    skip=0,
                    limit=20,
                )
        except Exception:
            logger.exception("Failed to reload conversation history")
            return

        self.conversation_history = [
            {"role": str(message.role), "content": str(message.content)}
            for message in messages
            if getattr(message, "role", None) in {"user", "assistant"}
            and str(getattr(message, "content", "") or "").strip()
        ]

    async def _send_model_reply(
        self,
        *,
        output: str,
        model_name: str,
        tool_calls: list[dict[str, Any]],
        complete_payload: dict[str, Any],
        streamed: bool = False,
    ) -> None:
        """Finalize and persist a completed assistant reply."""
        if not streamed:
            await send_event(self.websocket, "model_request_start", {})
            await send_event(self.websocket, "text_delta", {"index": 0, "content": output})
        await send_event(self.websocket, "final_result", {"output": output})

{%- if cookiecutter.use_database %}
        assistant_msg_id: str | None = None
        if self.current_conversation_id:
            assistant_msg_id = await persist_assistant_turn(
                self.current_conversation_id,
                output,
                model_name,
                tool_calls,
            )
        if assistant_msg_id:
            await send_event(
                self.websocket,
                "message_saved",
                {
                    "message_id": assistant_msg_id,
                    "conversation_id": self.current_conversation_id,
                },
            )
{%- endif %}
        await send_event(self.websocket, "complete", complete_payload)

{%- endif %}

    async def _send_workflow_reply(
        self,
        *,
        output: str,
        intent: str,
        title: str,
        summary: str,
        actions: list[dict[str, Any]],
    ) -> None:
        """Send a deterministic assistant reply with an action card."""
{%- if cookiecutter.use_database %}
        if not self.current_conversation_id:
            await send_event(self.websocket, "model_request_start", {})
            await send_event(self.websocket, "text_delta", {"index": 0, "content": output})
            await send_event(self.websocket, "final_result", {"output": output})
            await send_event(self.websocket, "complete", {"mode": "workflow", "intent": intent})
            return
{%- endif %}

        await send_event(self.websocket, "model_request_start", {})
        await send_event(self.websocket, "text_delta", {"index": 0, "content": output})
        await send_event(
            self.websocket,
            "requirement_action",
            {
                "action_type": intent,
                "title": title,
                "summary": summary,
                "payload": {"intent": intent},
                "actions": actions,
            },
        )
        await send_event(self.websocket, "final_result", {"output": output})

{%- if cookiecutter.use_database %}
        assistant_msg_id = await persist_assistant_turn(
            self.current_conversation_id,
            output,
            "workflow-router",
            [],
        )
        await send_event(
            self.websocket,
            "message_saved",
            {
                "message_id": assistant_msg_id,
                "conversation_id": self.current_conversation_id,
            },
        )
        await send_event(
            self.websocket,
            "complete",
            {"conversation_id": self.current_conversation_id, "mode": "workflow", "intent": intent},
        )
{%- else %}
        await send_event(self.websocket, "complete", {"mode": "workflow", "intent": intent})
{%- endif %}

    async def _send_offline_assistant_response(
        self,
        user_message: str,
        intent: str,
        error_message: str,
    ) -> None:
        """Return a transparent offline assistant state when the model is unavailable."""
        output = (
            "模型服务暂不可用, 我现在不能生成新的 AI 分析.\n\n"
            "你仍然可以先打开需求工作台、选择知识库、上传来源文档, 或稍后重试这一轮对话."
        )
        actions = [
            {"id": "retry", "label": "重试本轮", "kind": "retry", "payload": {"message": user_message}},
            *_chat_actions(intent),
        ]
        await send_event(
            self.websocket,
            "assistant_offline",
            {
                "message": output,
                "intent": intent,
                "retryable": True,
                "actions": actions,
                "error": error_message,
            },
        )
        await self._send_workflow_reply(
            output=output,
            intent=intent,
            title="离线助手",
            summary="当前只提供导航和重试, 不会伪造需求草稿或来源结论.",
            actions=actions,
        )

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
    async def _record_usage(
        self,
        *,
        agent_run: Any,
        assistant: Any,
        organization_id: Any,
    ) -> None:
        """Persist a UsageEvent + debit credits for the just-finished agent run."""
        try:
            usage = agent_run.usage()
        except Exception:
            logger.exception("usage_extract_failed")
            return

        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        cached_tokens = int(getattr(usage, "cache_read_tokens", 0) or 0)
        if input_tokens == 0 and output_tokens == 0:
            return

        from uuid import UUID

        try:
            org_uuid = (
                organization_id
                if isinstance(organization_id, UUID)
                else UUID(str(organization_id))
            )
        except Exception:
            logger.warning("usage_record_skipped_invalid_org_id", extra={"org": organization_id})
            return

        conv_uuid: UUID | None = None
        if self.current_conversation_id:
            try:
                conv_uuid = UUID(self.current_conversation_id)
            except Exception:
                conv_uuid = None

        try:
            async with get_db_context() as db:
                svc = UsageService(db)
                await svc.record(
                    organization_id=org_uuid,
                    actor_user_id=self.user.id,
                    conversation_id=conv_uuid,
                    model=getattr(assistant, "model_name", "") or "",
                    provider="{{ cookiecutter.llm_provider }}",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_tokens=cached_tokens,
                    ai_framework="pydantic_ai",
                )
        except Exception:
            logger.exception("usage_record_failed", extra={"org_id": str(org_uuid)})
{%- endif %}

{%- if (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}

    async def _build_multimodal_input(
        self, user_message: str, file_ids: list[Any]
    ) -> str | list[Any]:
        """Fold attached images and parsed file text into the user message."""
        if not file_ids:
            return user_message

        storage = get_file_storage()
        image_parts: list[BinaryContent] = []
        file_context_parts: list[str] = []

{%- if cookiecutter.use_postgresql %}
        async with get_db_context() as file_db:
            attached_files = await get_conversation_service(file_db).list_attached_files(file_ids)
            for chat_file in attached_files:
                try:
                    if chat_file.file_type == "image":
                        file_data = await storage.load(chat_file.storage_path)
                        image_parts.append(
                            BinaryContent(data=file_data, media_type=chat_file.mime_type)
                        )
                    elif chat_file.parsed_content:
                        file_context_parts.append(
                            f"\n---\nAttached file: {chat_file.filename}\n```\n{chat_file.parsed_content}\n```"
                        )
                except Exception as e:
                    logger.warning(f"Failed to load file {chat_file.id}: {e}")
{%- else %}
        with contextmanager(get_db_session)() as file_db:
            attached_files = get_conversation_service(file_db).list_attached_files(file_ids)
            for chat_file in attached_files:
                try:
                    if chat_file.file_type == "image":
                        file_data = await storage.load(chat_file.storage_path)
                        image_parts.append(
                            BinaryContent(data=file_data, media_type=chat_file.mime_type)
                        )
                    elif chat_file.parsed_content:
                        file_context_parts.append(
                            f"\n---\nAttached file: {chat_file.filename}\n```\n{chat_file.parsed_content}\n```"
                        )
                except Exception as e:
                    logger.warning(f"Failed to load file {chat_file.id}: {e}")
{%- endif %}

        full_text = user_message + "".join(file_context_parts)
        if image_parts:
            return [full_text, *image_parts]
        return full_text
{%- endif %}

    async def _stream_agent_run(
        self,
        agent_run: Any,
        user_message: str,
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Drive the agent_run iterator, dispatching each node to its streaming helper."""
        async for node in agent_run:
            if Agent.is_user_prompt_node(node):
                prompt_text = (
                    node.user_prompt if isinstance(node.user_prompt, str) else user_message
                )
                await send_event(
                    self.websocket, "user_prompt_processed", {"prompt": prompt_text}
                )
            elif Agent.is_model_request_node(node):
                await send_event(self.websocket, "model_request_start", {})
                async with node.stream(agent_run.ctx) as request_stream:
                    await self._stream_request_events(request_stream)
            elif Agent.is_call_tools_node(node):
                await send_event(self.websocket, "call_tools_start", {})
                async with node.stream(agent_run.ctx) as handle_stream:
                    await self._stream_tool_events(handle_stream, collected_tool_calls)
            elif Agent.is_end_node(node) and agent_run.result is not None:
                await send_event(
                    self.websocket, "final_result", {"output": agent_run.result.output}
                )

    async def _stream_request_events(self, request_stream: Any) -> None:
        """Forward model-request events (text/thinking/tool deltas + final-result start)."""
        async for event in request_stream:
            if isinstance(event, PartStartEvent):
                await send_event(
                    self.websocket,
                    "part_start",
                    {"index": event.index, "part_type": type(event.part).__name__},
                )
                if isinstance(event.part, TextPart) and event.part.content:
                    await send_event(
                        self.websocket,
                        "text_delta",
                        {"index": event.index, "content": event.part.content},
                    )
                elif isinstance(event.part, ThinkingPart) and event.part.content:
                    # Surface the model's reasoning trace to the UI. Anthropic +
                    # OpenAI-reasoning models emit these as the model "thinks".
                    await send_event(
                        self.websocket,
                        "thinking_delta",
                        {"index": event.index, "content": event.part.content},
                    )
            elif isinstance(event, PartDeltaEvent):
                if isinstance(event.delta, TextPartDelta):
                    await send_event(
                        self.websocket,
                        "text_delta",
                        {"index": event.index, "content": event.delta.content_delta},
                    )
                elif isinstance(event.delta, ThinkingPartDelta):
                    if event.delta.content_delta:
                        await send_event(
                            self.websocket,
                            "thinking_delta",
                            {"index": event.index, "content": event.delta.content_delta},
                        )
                elif isinstance(event.delta, ToolCallPartDelta):
                    await send_event(
                        self.websocket,
                        "tool_call_delta",
                        {"index": event.index, "args_delta": event.delta.args_delta},
                    )
            elif isinstance(event, FinalResultEvent):
                await send_event(
                    self.websocket,
                    "final_result_start",
                    {"tool_name": event.tool_name},
                )

    async def _stream_tool_events(
        self,
        handle_stream: Any,
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Forward tool-call/result events; collect tool calls (with results) for persistence."""
        pending: dict[str, dict[str, Any]] = {}
        async for tool_event in handle_stream:
            if isinstance(tool_event, FunctionToolCallEvent):
                tc = {
                    "tool_call_id": tool_event.part.tool_call_id,
                    "tool_name": tool_event.part.tool_name,
                    "args": tool_event.part.args,
                }
                collected_tool_calls.append(tc)
                pending[tool_event.part.tool_call_id] = tc
                await send_event(self.websocket, "tool_call", tc)
            elif isinstance(tool_event, FunctionToolResultEvent):
                tc = pending.get(tool_event.tool_call_id)
                if tc is not None:
                    tc["result"] = str(tool_event.result.content)
                await send_event(
                    self.websocket,
                    "tool_result",
                    {
                        "tool_call_id": tool_event.tool_call_id,
                        "content": str(tool_event.result.content),
                    },
                )
{%- elif cookiecutter.use_langchain %}
"""Per-connection AI agent session (LangChain)."""

import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from langchain.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langchain_core.messages.ai import add_usage

from app.agents.langchain_assistant import AgentContext, get_agent
from app.services.agent import (
    build_message_history,
{%- if cookiecutter.use_database %}
    persist_assistant_turn,
    persist_user_turn,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    resolve_kb_collections,
{%- endif %}
    send_event,
)
{%- if cookiecutter.websocket_auth_jwt %}
from app.db.models.user import User
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.db.session import get_db_context
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.services.usage import UsageService
{%- endif %}

logger = logging.getLogger(__name__)


class AgentSession:
    """One WebSocket session with the LangChain agent."""

    def __init__(
        self,
        websocket: WebSocket,
{%- if cookiecutter.websocket_auth_jwt %}
        user: User,
{%- endif %}
    ) -> None:
        self.websocket = websocket
{%- if cookiecutter.websocket_auth_jwt %}
        self.user = user
{%- endif %}
        self.conversation_history: list[dict[str, str]] = []
        self.context: AgentContext = {}
{%- if cookiecutter.websocket_auth_jwt %}
        self.context["user_id"] = str(user.id) if user else None
        self.context["user_name"] = user.email if user else None
{%- endif %}
{%- if cookiecutter.use_database %}
        self.current_conversation_id: str | None = None
{%- endif %}

    async def process_message(self, data: dict[str, Any]) -> None:
        """Process one user turn: persist input, run the agent, stream events, persist output."""
        user_message = data.get("message", "")
        file_ids = data.get("file_ids", [])

        if not user_message and not file_ids:
            await send_event(self.websocket, "error", {"message": "Empty message"})
            return

{%- if cookiecutter.use_database %}
        self.current_conversation_id, newly_created, organization_id = await persist_user_turn(
{%- if cookiecutter.websocket_auth_jwt %}
            self.user,
{%- endif %}
            user_message,
            file_ids,
            requested_conversation_id=data.get("conversation_id"),
            current_conversation_id=self.current_conversation_id,
        )
        if newly_created and self.current_conversation_id:
            await send_event(
                self.websocket,
                "conversation_created",
                {"conversation_id": self.current_conversation_id},
            )
{%- endif %}

        await send_event(self.websocket, "user_prompt", {"content": user_message})

        try:
            assistant = get_agent(
                model_name=data.get("model"),
                thinking_effort=data.get("thinking_effort"),
            )
            model_history = build_message_history(self.conversation_history)
            model_history.append(HumanMessage(content=user_message))

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
            from app.agents.tools.rag_tool import _active_kb_collections
            kb_names = await resolve_kb_collections(
{%- if cookiecutter.use_database %}
                self.current_conversation_id,
{%- else %}
                None,
{%- endif %}
{%- if cookiecutter.websocket_auth_jwt %}
{%- if cookiecutter.use_postgresql %}
                self.user.id,
{%- else %}
                str(self.user.id),
{%- endif %}
{%- endif %}
                override_kb_ids=(
                    [str(i) for i in (data.get("active_knowledge_base_ids") or [])]
                    if "active_knowledge_base_ids" in data and isinstance(data.get("active_knowledge_base_ids"), list)
                    else None
                ),
{%- if cookiecutter.enable_teams and cookiecutter.use_database %}
                organization_id=str(organization_id) if organization_id else None,
{%- endif %}
            )
            kb_token = _active_kb_collections.set(kb_names)
            try:
                collected_tool_calls: list[dict[str, Any]] = []
                final_output = await self._stream_agent_response(
                    assistant, model_history, collected_tool_calls
                )
            finally:
                _active_kb_collections.reset(kb_token)
{%- else %}
            collected_tool_calls: list[dict[str, Any]] = []
            final_output = await self._stream_agent_response(
                assistant, model_history, collected_tool_calls
            )
{%- endif %}

            # Update in-memory history only after the agent produced output
            if final_output:
                self.conversation_history.append({"role": "user", "content": user_message})
                self.conversation_history.append(
                    {"role": "assistant", "content": final_output}
                )

{%- if cookiecutter.use_database %}
            assistant_msg_id: str | None = None
            if self.current_conversation_id and final_output:
                assistant_msg_id = await persist_assistant_turn(
                    self.current_conversation_id,
                    final_output,
                    getattr(assistant, "model_name", None),
                    collected_tool_calls,
                )

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
            # Record usage + debit credits (best-effort).
            if final_output and organization_id and getattr(self, "_last_usage_metadata", None):
                await self._record_usage(
                    assistant=assistant,
                    organization_id=organization_id,
                    usage_metadata=self._last_usage_metadata,
                )
{%- endif %}

            if assistant_msg_id:
                await send_event(
                    self.websocket,
                    "message_saved",
                    {
                        "message_id": assistant_msg_id,
                        "conversation_id": self.current_conversation_id,
                    },
                )

            await send_event(
                self.websocket,
                "complete",
                {"conversation_id": self.current_conversation_id},
            )
{%- else %}
            await send_event(self.websocket, "complete", {})
{%- endif %}
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.exception(f"Error processing agent request: {e}")
            await send_event(self.websocket, "error", {"message": str(e)})

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
    async def _record_usage(
        self,
        *,
        assistant: Any,
        organization_id: Any,
        usage_metadata: Any,
    ) -> None:
        """Persist a UsageEvent + debit credits using LangChain UsageMetadata."""
        if not usage_metadata:
            return
        input_tokens = int(usage_metadata.get("input_tokens") or 0)
        output_tokens = int(usage_metadata.get("output_tokens") or 0)
        cached_tokens = int(
            (usage_metadata.get("input_token_details") or {}).get("cache_read") or 0
        )
        if input_tokens == 0 and output_tokens == 0:
            return

        from uuid import UUID

        try:
            org_uuid = (
                organization_id
                if isinstance(organization_id, UUID)
                else UUID(str(organization_id))
            )
        except Exception:
            return

        conv_uuid: UUID | None = None
        if self.current_conversation_id:
            try:
                conv_uuid = UUID(self.current_conversation_id)
            except Exception:
                conv_uuid = None

        try:
            async with get_db_context() as db:
                await UsageService(db).record(
                    organization_id=org_uuid,
                    actor_user_id=self.user.id,
                    conversation_id=conv_uuid,
                    model=getattr(assistant, "model_name", "") or "",
                    provider="{{ cookiecutter.llm_provider }}",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_tokens=cached_tokens,
                    ai_framework="langchain",
                )
        except Exception:
            logger.exception("usage_record_failed")
{%- endif %}

    async def _stream_agent_response(
        self,
        assistant: Any,
        model_history: list[Any],
        collected_tool_calls: list[dict[str, Any]],
    ) -> str:
        """Run ``assistant.agent.astream`` and forward all events; return accumulated text."""
        final_output = ""
        seen_tool_call_ids: set[str] = set()
        pending: dict[str, dict[str, Any]] = {}
        # Sum usage_metadata across the turn's model calls. We add only the
        # usage dicts (via add_usage), never whole chunks — merging full
        # AIMessageChunks via `+` crashes on scalar additional_kwargs like the
        # OpenAI Responses API's float ``created_at``.
        self._last_usage_metadata = None
        # Per-turn flag: did we already stream reasoning from token chunks?
        # If not, _stream_update_event falls back to the final message's
        # reasoning so thinking is shown for providers that don't stream it.
        self._thinking_streamed = False

        await send_event(self.websocket, "model_request_start", {})

        async for stream_mode, data in assistant.agent.astream(
            {"messages": model_history},
            stream_mode=["messages", "updates"],
            config={"configurable": self.context} if self.context else None,
        ):
            if stream_mode == "messages":
                token, _metadata = data
                if isinstance(token, AIMessageChunk):
                    if token.usage_metadata:
                        self._last_usage_metadata = (
                            token.usage_metadata
                            if self._last_usage_metadata is None
                            else add_usage(self._last_usage_metadata, token.usage_metadata)
                        )
                    final_output += await self._stream_message_chunk(token)
            elif stream_mode == "updates":
                await self._stream_update_event(
                    data, seen_tool_call_ids, pending, collected_tool_calls
                )

        await send_event(self.websocket, "final_result", {"output": final_output})
        return final_output

    @staticmethod
    def _extract_reasoning(message: Any) -> str:
        """Pull reasoning/thinking text from a LangChain message or chunk.

        Covers three shapes:
          * Anthropic extended thinking — ``{"type":"thinking","thinking":"..."}``
          * OpenAI Responses API — ``{"type":"reasoning","summary":[{"type":"summary_text","text":"..."}]}``
          * Legacy providers — ``additional_kwargs.reasoning_content`` (string)
        """
        out = ""
        content = getattr(message, "content", None)
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "thinking":
                    out += block.get("thinking", "") or ""
                elif btype == "reasoning":
                    for summary in block.get("summary", []) or []:
                        if (
                            isinstance(summary, dict)
                            and summary.get("type") == "summary_text"
                        ):
                            out += summary.get("text", "") or ""
        legacy = (getattr(message, "additional_kwargs", None) or {}).get(
            "reasoning_content"
        )
        if isinstance(legacy, str):
            out += legacy
        return out

    async def _stream_message_chunk(self, token: AIMessageChunk) -> str:
        """Emit text + reasoning deltas from a streaming chunk.

        Tool calls are intentionally NOT emitted here. Streamed
        ``tool_call_chunks`` carry only partial JSON-string argument
        fragments, not a usable args dict — emitting from here produced
        ``tool_call`` events with empty ``args`` (and, because they were
        deduped against the same id set, suppressed the complete event).
        The canonical tool call, with full args, is emitted from the
        ``updates`` stream in ``_stream_update_event``.
        """
        text_content = ""
        if token.content:
            if isinstance(token.content, str):
                text_content = token.content
            elif isinstance(token.content, list):
                for block in token.content:
                    if isinstance(block, str):
                        text_content += block
                    elif isinstance(block, dict) and block.get("type") == "text":
                        text_content += block.get("text", "")
            if text_content:
                await send_event(self.websocket, "text_delta", {"content": text_content})

        reasoning_content = self._extract_reasoning(token)
        if reasoning_content:
            self._thinking_streamed = True
            await send_event(
                self.websocket, "thinking_delta", {"content": reasoning_content}
            )
        return text_content

    async def _stream_update_event(
        self,
        update_data: dict[str, Any],
        seen_tool_call_ids: set[str],
        pending: dict[str, dict[str, Any]],
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Process ``updates`` stream events — the source of truth for tools.

        Tool calls here carry the complete name + parsed ``args`` from
        ``AIMessage.tool_calls`` (unlike the partial streamed chunks). Also
        emits a reasoning fallback for providers that attach the chain of
        thought to the final message instead of streaming it.
        """
        for node_name, update in update_data.items():
            if node_name == "tools":
                for msg in update.get("messages", []):
                    if isinstance(msg, ToolMessage):
                        tc = pending.get(msg.tool_call_id)
                        if tc is not None:
                            tc["result"] = str(msg.content)
                        await send_event(
                            self.websocket,
                            "tool_result",
                            {"tool_call_id": msg.tool_call_id, "content": msg.content},
                        )
            elif node_name == "model":
                for msg in update.get("messages", []):
                    if not isinstance(msg, AIMessage):
                        continue
                    if not self._thinking_streamed:
                        reasoning = self._extract_reasoning(msg)
                        if reasoning:
                            self._thinking_streamed = True
                            await send_event(
                                self.websocket,
                                "thinking_delta",
                                {"content": reasoning},
                            )
                    for tc_in in msg.tool_calls or []:
                        tc_id = tc_in.get("id", "")
                        if not tc_id:
                            continue
                        tc = {
                            "tool_call_id": tc_id,
                            "tool_name": tc_in.get("name", ""),
                            "args": tc_in.get("args", {}),
                        }
                        pending[tc_id] = tc
                        collected_tool_calls.append(tc)
                        if tc_id not in seen_tool_call_ids:
                            seen_tool_call_ids.add(tc_id)
                            await send_event(self.websocket, "tool_call", tc)
{%- elif cookiecutter.use_langgraph %}
"""Per-connection AI agent session (LangGraph)."""

import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_core.messages.ai import add_usage

from app.agents.langgraph_assistant import AgentContext, get_agent
from app.services.agent import (
{%- if cookiecutter.use_database %}
    persist_assistant_turn,
    persist_user_turn,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    resolve_kb_collections,
{%- endif %}
    send_event,
)
{%- if cookiecutter.websocket_auth_jwt %}
from app.db.models.user import User
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.db.session import get_db_context
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.services.usage import UsageService
{%- endif %}

logger = logging.getLogger(__name__)


class AgentSession:
    """One WebSocket session with the LangGraph ReAct agent."""

    def __init__(
        self,
        websocket: WebSocket,
{%- if cookiecutter.websocket_auth_jwt %}
        user: User,
{%- endif %}
    ) -> None:
        self.websocket = websocket
{%- if cookiecutter.websocket_auth_jwt %}
        self.user = user
{%- endif %}
        self.conversation_history: list[dict[str, str]] = []
        self.context: AgentContext = {}
{%- if cookiecutter.websocket_auth_jwt %}
        self.context["user_id"] = str(user.id) if user else None
        self.context["user_name"] = user.email if user else None
{%- endif %}
{%- if cookiecutter.use_database %}
        self.current_conversation_id: str | None = None
{%- endif %}

    async def process_message(self, data: dict[str, Any]) -> None:
        """Process one user turn: persist input, run the agent, stream events, persist output."""
        user_message = data.get("message", "")
        file_ids = data.get("file_ids", [])

        if not user_message and not file_ids:
            await send_event(self.websocket, "error", {"message": "Empty message"})
            return

{%- if cookiecutter.use_database %}
        self.current_conversation_id, newly_created, organization_id = await persist_user_turn(
{%- if cookiecutter.websocket_auth_jwt %}
            self.user,
{%- endif %}
            user_message,
            file_ids,
            requested_conversation_id=data.get("conversation_id"),
            current_conversation_id=self.current_conversation_id,
        )
        if newly_created and self.current_conversation_id:
            await send_event(
                self.websocket,
                "conversation_created",
                {"conversation_id": self.current_conversation_id},
            )
{%- endif %}

        await send_event(self.websocket, "user_prompt", {"content": user_message})

        try:
            assistant = get_agent(
                model_name=data.get("model"),
                thinking_effort=data.get("thinking_effort"),
            )

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
            from app.agents.tools.rag_tool import _active_kb_collections
            kb_names = await resolve_kb_collections(
{%- if cookiecutter.use_database %}
                self.current_conversation_id,
{%- else %}
                None,
{%- endif %}
{%- if cookiecutter.websocket_auth_jwt %}
{%- if cookiecutter.use_postgresql %}
                self.user.id,
{%- else %}
                str(self.user.id),
{%- endif %}
{%- endif %}
                override_kb_ids=(
                    [str(i) for i in (data.get("active_knowledge_base_ids") or [])]
                    if "active_knowledge_base_ids" in data and isinstance(data.get("active_knowledge_base_ids"), list)
                    else None
                ),
{%- if cookiecutter.enable_teams and cookiecutter.use_database %}
                organization_id=str(organization_id) if organization_id else None,
{%- endif %}
            )
            kb_token = _active_kb_collections.set(kb_names)
            try:
                collected_tool_calls: list[dict[str, Any]] = []
                final_output = await self._stream_agent_response(
                    assistant, user_message, collected_tool_calls
                )
            finally:
                _active_kb_collections.reset(kb_token)
{%- else %}
            collected_tool_calls: list[dict[str, Any]] = []
            final_output = await self._stream_agent_response(
                assistant, user_message, collected_tool_calls
            )
{%- endif %}

            if final_output:
                self.conversation_history.append({"role": "user", "content": user_message})
                self.conversation_history.append(
                    {"role": "assistant", "content": final_output}
                )

{%- if cookiecutter.use_database %}
            assistant_msg_id: str | None = None
            if self.current_conversation_id and final_output:
                assistant_msg_id = await persist_assistant_turn(
                    self.current_conversation_id,
                    final_output,
                    getattr(assistant, "model_name", None),
                    collected_tool_calls,
                )

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
            # Record usage + debit credits (best-effort).
            if final_output and organization_id and getattr(self, "_last_usage_metadata", None):
                await self._record_usage(
                    assistant=assistant,
                    organization_id=organization_id,
                    usage_metadata=self._last_usage_metadata,
                )
{%- endif %}

            if assistant_msg_id:
                await send_event(
                    self.websocket,
                    "message_saved",
                    {
                        "message_id": assistant_msg_id,
                        "conversation_id": self.current_conversation_id,
                    },
                )

            await send_event(
                self.websocket,
                "complete",
                {"conversation_id": self.current_conversation_id},
            )
{%- else %}
            await send_event(self.websocket, "complete", {})
{%- endif %}
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.exception(f"Error processing agent request: {e}")
            await send_event(self.websocket, "error", {"message": str(e)})

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
    async def _record_usage(
        self,
        *,
        assistant: Any,
        organization_id: Any,
        usage_metadata: Any,
    ) -> None:
        """Persist a UsageEvent + debit credits using LangChain UsageMetadata."""
        if not usage_metadata:
            return
        input_tokens = int(usage_metadata.get("input_tokens") or 0)
        output_tokens = int(usage_metadata.get("output_tokens") or 0)
        cached_tokens = int(
            (usage_metadata.get("input_token_details") or {}).get("cache_read") or 0
        )
        if input_tokens == 0 and output_tokens == 0:
            return

        from uuid import UUID

        try:
            org_uuid = (
                organization_id
                if isinstance(organization_id, UUID)
                else UUID(str(organization_id))
            )
        except Exception:
            return

        conv_uuid: UUID | None = None
        if self.current_conversation_id:
            try:
                conv_uuid = UUID(self.current_conversation_id)
            except Exception:
                conv_uuid = None

        try:
            async with get_db_context() as db:
                await UsageService(db).record(
                    organization_id=org_uuid,
                    actor_user_id=self.user.id,
                    conversation_id=conv_uuid,
                    model=getattr(assistant, "model_name", "") or "",
                    provider="{{ cookiecutter.llm_provider }}",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_tokens=cached_tokens,
                    ai_framework="langgraph",
                )
        except Exception:
            logger.exception("usage_record_failed")
{%- endif %}

    async def _stream_agent_response(
        self,
        assistant: Any,
        user_message: str,
        collected_tool_calls: list[dict[str, Any]],
    ) -> str:
        """Run the LangGraph agent stream and forward all events; return accumulated text."""
        final_output = ""
        seen_tool_call_ids: set[str] = set()
        pending: dict[str, dict[str, Any]] = {}
        # Sum usage_metadata across the turn's model calls. We add only the
        # usage dicts (via add_usage), never whole chunks — merging full
        # AIMessageChunks via `+` crashes on scalar additional_kwargs like the
        # OpenAI Responses API's float ``created_at``.
        self._last_usage_metadata = None
        # Per-turn flag: did we already stream reasoning from token chunks?
        # If not, _stream_update_event falls back to the final message's
        # reasoning so thinking is shown for providers that don't stream it.
        self._thinking_streamed = False

        await send_event(self.websocket, "model_request_start", {})

        async for stream_mode, data in assistant.stream(
            user_message, history=self.conversation_history, context=self.context
        ):
            if stream_mode == "messages":
                chunk, _metadata = data
                if isinstance(chunk, AIMessageChunk):
                    if chunk.usage_metadata:
                        self._last_usage_metadata = (
                            chunk.usage_metadata
                            if self._last_usage_metadata is None
                            else add_usage(self._last_usage_metadata, chunk.usage_metadata)
                        )
                    final_output += await self._stream_message_chunk(chunk)
            elif stream_mode == "updates":
                await self._stream_update_event(
                    data, seen_tool_call_ids, pending, collected_tool_calls
                )

        await send_event(self.websocket, "final_result", {"output": final_output})
        return final_output

    @staticmethod
    def _extract_reasoning(message: Any) -> str:
        """Pull reasoning/thinking text from a LangChain message or chunk.

        Covers three shapes:
          * Anthropic extended thinking — ``{"type":"thinking","thinking":"..."}``
          * OpenAI Responses API — ``{"type":"reasoning","summary":[{"type":"summary_text","text":"..."}]}``
          * Legacy providers — ``additional_kwargs.reasoning_content`` (string)
        """
        out = ""
        content = getattr(message, "content", None)
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "thinking":
                    out += block.get("thinking", "") or ""
                elif btype == "reasoning":
                    for summary in block.get("summary", []) or []:
                        if (
                            isinstance(summary, dict)
                            and summary.get("type") == "summary_text"
                        ):
                            out += summary.get("text", "") or ""
        legacy = (getattr(message, "additional_kwargs", None) or {}).get(
            "reasoning_content"
        )
        if isinstance(legacy, str):
            out += legacy
        return out

    async def _stream_message_chunk(self, chunk: AIMessageChunk) -> str:
        """Emit text + reasoning deltas from a streaming chunk.

        Tool calls are intentionally NOT emitted here. Streamed
        ``tool_call_chunks`` carry only partial JSON-string argument
        fragments, not a usable args dict — emitting from here produced
        ``tool_call`` events with empty ``args`` (and, because they were
        deduped against the same id set, suppressed the complete event).
        The canonical tool call, with full args, is emitted from the
        ``updates`` stream in ``_stream_update_event``.
        """
        text_content = ""
        if chunk.content:
            if isinstance(chunk.content, str):
                text_content = chunk.content
            elif isinstance(chunk.content, list):
                for block in chunk.content:
                    if isinstance(block, str):
                        text_content += block
                    elif isinstance(block, dict) and block.get("type") == "text":
                        text_content += block.get("text", "")
            if text_content:
                await send_event(self.websocket, "text_delta", {"content": text_content})

        reasoning_content = self._extract_reasoning(chunk)
        if reasoning_content:
            self._thinking_streamed = True
            await send_event(
                self.websocket, "thinking_delta", {"content": reasoning_content}
            )
        return text_content

    async def _stream_update_event(
        self,
        update_data: dict[str, Any],
        seen_tool_call_ids: set[str],
        pending: dict[str, dict[str, Any]],
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Process LangGraph ``updates`` events — the source of truth for tools.

        Tool calls here carry the complete name + parsed ``args`` from
        ``AIMessage.tool_calls`` (unlike the partial streamed chunks). Also
        emits a reasoning fallback for providers that attach the chain of
        thought to the final message instead of streaming it.
        """
        for node_name, update in update_data.items():
            if node_name == "tools":
                for msg in update.get("messages", []):
                    if isinstance(msg, ToolMessage):
                        tc = pending.get(msg.tool_call_id)
                        if tc is not None:
                            tc["result"] = str(msg.content)
                        await send_event(
                            self.websocket,
                            "tool_result",
                            {"tool_call_id": msg.tool_call_id, "content": msg.content},
                        )
            elif node_name == "agent":
                for msg in update.get("messages", []):
                    if not isinstance(msg, AIMessage):
                        continue
                    if not self._thinking_streamed:
                        reasoning = self._extract_reasoning(msg)
                        if reasoning:
                            self._thinking_streamed = True
                            await send_event(
                                self.websocket,
                                "thinking_delta",
                                {"content": reasoning},
                            )
                    for tc_in in msg.tool_calls or []:
                        tc_id = tc_in.get("id", "")
                        if not tc_id:
                            continue
                        tc = {
                            "tool_call_id": tc_id,
                            "tool_name": tc_in.get("name", ""),
                            "args": tc_in.get("args", {}),
                        }
                        pending[tc_id] = tc
                        collected_tool_calls.append(tc)
                        if tc_id not in seen_tool_call_ids:
                            seen_tool_call_ids.add(tc_id)
                            await send_event(self.websocket, "tool_call", tc)
{%- elif cookiecutter.use_crewai %}
"""Per-connection AI agent session (CrewAI Multi-Agent)."""

import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.agents.crewai_assistant import CrewContext, get_crew
from app.services.agent import (
{%- if cookiecutter.use_database %}
    persist_assistant_turn,
    persist_user_turn,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    resolve_kb_collections,
{%- endif %}
    send_event,
)
{%- if cookiecutter.websocket_auth_jwt %}
from app.db.models.user import User
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.db.session import get_db_context
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.services.usage import UsageService
{%- endif %}

logger = logging.getLogger(__name__)


class AgentSession:
    """One WebSocket session with a CrewAI crew."""

    def __init__(
        self,
        websocket: WebSocket,
{%- if cookiecutter.websocket_auth_jwt %}
        user: User,
{%- endif %}
    ) -> None:
        self.websocket = websocket
{%- if cookiecutter.websocket_auth_jwt %}
        self.user = user
{%- endif %}
        self.conversation_history: list[dict[str, str]] = []
        self.context: CrewContext = {}
{%- if cookiecutter.websocket_auth_jwt %}
        self.context["user_id"] = str(user.id) if user else None
        self.context["user_name"] = user.email if user else None
{%- endif %}
{%- if cookiecutter.use_database %}
        self.current_conversation_id: str | None = None
{%- endif %}

    async def process_message(self, data: dict[str, Any]) -> None:
        """Process one user turn: persist input, run the crew, stream events."""
        user_message = data.get("message", "")
        file_ids = data.get("file_ids", [])

        if not user_message and not file_ids:
            await send_event(self.websocket, "error", {"message": "Empty message"})
            return

        # Reset usage tracking for the new turn.
        self._last_usage = None

{%- if cookiecutter.use_database %}
        self.current_conversation_id, newly_created, organization_id = await persist_user_turn(
{%- if cookiecutter.websocket_auth_jwt %}
            self.user,
{%- endif %}
            user_message,
            file_ids,
            requested_conversation_id=data.get("conversation_id"),
            current_conversation_id=self.current_conversation_id,
        )
        if newly_created and self.current_conversation_id:
            await send_event(
                self.websocket,
                "conversation_created",
                {"conversation_id": self.current_conversation_id},
            )
{%- endif %}

        await send_event(self.websocket, "user_prompt", {"content": user_message})

        try:
            crew_assistant = get_crew()

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
            from app.agents.tools.rag_tool import _active_kb_collections
            kb_names = await resolve_kb_collections(
{%- if cookiecutter.use_database %}
                self.current_conversation_id,
{%- else %}
                None,
{%- endif %}
{%- if cookiecutter.websocket_auth_jwt %}
{%- if cookiecutter.use_postgresql %}
                self.user.id,
{%- else %}
                str(self.user.id),
{%- endif %}
{%- endif %}
                override_kb_ids=(
                    [str(i) for i in (data.get("active_knowledge_base_ids") or [])]
                    if "active_knowledge_base_ids" in data and isinstance(data.get("active_knowledge_base_ids"), list)
                    else None
                ),
{%- if cookiecutter.enable_teams and cookiecutter.use_database %}
                organization_id=str(organization_id) if organization_id else None,
{%- endif %}
            )
            kb_token = _active_kb_collections.set(kb_names)
            try:
                final_output = await self._stream_crew_response(crew_assistant, user_message)
            finally:
                _active_kb_collections.reset(kb_token)
{%- else %}
            final_output = await self._stream_crew_response(crew_assistant, user_message)
{%- endif %}

            if final_output:
                self.conversation_history.append({"role": "user", "content": user_message})
                self.conversation_history.append(
                    {"role": "assistant", "content": final_output}
                )

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
            # Record usage + debit credits (best-effort).
            if final_output and organization_id:
                await self._record_usage(
                    crew_assistant=crew_assistant,
                    organization_id=organization_id,
                )
{%- endif %}

            await send_event(
                self.websocket,
                "complete",
                {
{%- if cookiecutter.use_database %}
                    "conversation_id": self.current_conversation_id,
{%- endif %}
                },
            )
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.exception(f"Error processing agent request: {e}")
            await send_event(self.websocket, "error", {"message": str(e)})

    async def _stream_crew_response(self, crew_assistant: Any, user_message: str) -> str:
        """Run the CrewAI crew stream and forward all events; persist per-agent messages."""
        final_output = ""

        await send_event(
            self.websocket,
            "crew_start",
            {
                "crew_name": crew_assistant.config.name,
                "process": crew_assistant.config.process,
            },
        )

        async for event in crew_assistant.stream(
            user_message, history=self.conversation_history, context=self.context
        ):
            event_type = event.get("type", "unknown")

            if event_type == "crew_started":
                await send_event(
                    self.websocket,
                    "crew_started",
                    {
                        "crew_name": event.get("crew_name", ""),
                        "crew_id": event.get("crew_id", ""),
                    },
                )
            elif event_type == "agent_started":
                await send_event(
                    self.websocket,
                    "agent_started",
                    {"agent": event.get("agent", ""), "task": event.get("task", "")},
                )
            elif event_type == "agent_completed":
                agent_name = event.get("agent", "")
                agent_output = event.get("output", "")
                await send_event(
                    self.websocket,
                    "agent_completed",
                    {"agent": agent_name, "output": agent_output},
                )
{%- if cookiecutter.use_database %}
                if self.current_conversation_id and agent_output:
                    await persist_assistant_turn(
                        self.current_conversation_id,
                        f"✅ **{agent_name}**\n\n{agent_output}",
                        None,
                        [],
                    )
{%- endif %}
            elif event_type == "task_started":
                await send_event(
                    self.websocket,
                    "task_started",
                    {
                        "task_id": event.get("task_id", ""),
                        "description": event.get("description", ""),
                        "agent": event.get("agent", ""),
                    },
                )
            elif event_type == "task_completed":
                await send_event(
                    self.websocket,
                    "task_completed",
                    {
                        "task_id": event.get("task_id", ""),
                        "output": event.get("output", ""),
                        "agent": event.get("agent", ""),
                    },
                )
            elif event_type == "tool_started":
                await send_event(
                    self.websocket,
                    "tool_started",
                    {
                        "tool_name": event.get("tool_name", ""),
                        "tool_args": event.get("tool_args", ""),
                        "agent": event.get("agent", ""),
                    },
                )
            elif event_type == "tool_finished":
                await send_event(
                    self.websocket,
                    "tool_finished",
                    {
                        "tool_name": event.get("tool_name", ""),
                        "tool_result": event.get("tool_result", ""),
                        "agent": event.get("agent", ""),
                    },
                )
            elif event_type == "llm_started":
                await send_event(
                    self.websocket, "llm_started", {"agent": event.get("agent", "")}
                )
            elif event_type == "llm_completed":
                await send_event(
                    self.websocket,
                    "llm_completed",
                    {
                        "agent": event.get("agent", ""),
                        "response": event.get("response", ""),
                    },
                )
            elif event_type == "crew_complete":
                final_output = event.get("result", "")
                self._last_usage = event.get("usage")
                await send_event(
                    self.websocket, "final_result", {"output": final_output}
                )
            elif event_type == "error":
                await send_event(
                    self.websocket,
                    "error",
                    {"message": event.get("error", "Unknown error")},
                )

        return final_output

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
    async def _record_usage(
        self,
        *,
        crew_assistant: Any,
        organization_id: Any,
    ) -> None:
        """Persist a UsageEvent + debit credits using CrewAI usage_metrics."""
        usage = getattr(self, "_last_usage", None)
        if not usage:
            return
        input_tokens = int(usage.get("prompt_tokens") or 0)
        output_tokens = int(usage.get("completion_tokens") or 0)
        cached_tokens = int(usage.get("cached_prompt_tokens") or 0)
        if input_tokens == 0 and output_tokens == 0:
            return

        from uuid import UUID

        try:
            org_uuid = (
                organization_id
                if isinstance(organization_id, UUID)
                else UUID(str(organization_id))
            )
        except Exception:
            return

        conv_uuid: UUID | None = None
        if self.current_conversation_id:
            try:
                conv_uuid = UUID(self.current_conversation_id)
            except Exception:
                conv_uuid = None

        # CrewAI doesn't expose a single model name (multi-agent), so use config.name as a tag.
        model = getattr(getattr(crew_assistant, "config", None), "name", "") or ""

        try:
            async with get_db_context() as db:
                await UsageService(db).record(
                    organization_id=org_uuid,
                    actor_user_id=self.user.id,
                    conversation_id=conv_uuid,
                    model=model,
                    provider="{{ cookiecutter.llm_provider }}",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_tokens=cached_tokens,
                    ai_framework="crewai",
                )
        except Exception:
            logger.exception("usage_record_failed")
{%- endif %}
{%- elif cookiecutter.use_deepagents %}
"""Per-connection AI agent session (DeepAgents) with human-in-the-loop support."""

import logging
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
from langchain_core.messages.ai import add_usage

from app.agents.deepagents_assistant import (
    AgentContext,
    Decision,
    InterruptData,
    get_agent,
)
from app.services.agent import (
{%- if cookiecutter.use_database %}
    persist_assistant_turn,
    persist_user_turn,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    resolve_kb_collections,
{%- endif %}
    send_event,
)
{%- if cookiecutter.websocket_auth_jwt %}
from app.db.models.user import User
{%- endif %}
{%- if (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.api.deps import get_conversation_service
from app.db.session import get_db_context{% if cookiecutter.use_sqlite %}, get_db_session
from contextlib import contextmanager{% endif %}
{%- endif %}
{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.services.usage import UsageService
{%- endif %}

logger = logging.getLogger(__name__)


class AgentSession:
    """One WebSocket session with a DeepAgents agent (with optional HITL).

    Tracks ``pending_interrupt`` across turns so that ``{"type": "resume"}`` messages
    from the client can be matched to the in-flight agent run.
    """

    def __init__(
        self,
        websocket: WebSocket,
{%- if cookiecutter.websocket_auth_jwt %}
        user: User,
{%- endif %}
    ) -> None:
        self.websocket = websocket
{%- if cookiecutter.websocket_auth_jwt %}
        self.user = user
{%- endif %}
        self.conversation_history: list[dict[str, str]] = []
        self.context: AgentContext = {}
{%- if cookiecutter.websocket_auth_jwt %}
        self.context["user_id"] = str(user.id) if user else None
        self.context["user_name"] = user.email if user else None
{%- endif %}
        self.thread_id: str = str(uuid.uuid4())
        self.pending_interrupt: InterruptData | None = None
        self.assistant = get_agent()
        # Track the thinking effort baked into ``self.assistant``; if the
        # client toggles it between turns we rebuild the assistant so the new
        # setting takes effect (HITL state is per-graph and changing it would
        # invalidate any pending interrupt anyway).
        self._current_thinking_effort: str | None = None
{%- if cookiecutter.use_database %}
        self.current_conversation_id: str | None = None
{%- endif %}

    async def process_message(self, data: dict[str, Any]) -> None:
        """Dispatch incoming WebSocket payload to the appropriate handler."""
        if data.get("type", "message") == "resume":
            await self._handle_resume(data)
        else:
            await self._handle_message(data)

    async def _handle_resume(self, data: dict[str, Any]) -> None:
        """Resume an interrupted agent run with user decisions."""
        if not self.pending_interrupt:
            await send_event(
                self.websocket, "error", {"message": "No pending interrupt to resume"}
            )
            return

        decisions: list[Decision] = data.get("decisions", [])
        if len(decisions) != len(self.pending_interrupt["action_requests"]):
            await send_event(
                self.websocket,
                "error",
                {
                    "message": (
                        f"Expected {len(self.pending_interrupt['action_requests'])} decisions, "
                        f"got {len(decisions)}"
                    )
                },
            )
            return

        try:
            await send_event(self.websocket, "resume_start", {})
            collected_tool_calls: list[dict[str, Any]] = []
            final_output, new_interrupt = await self._drive_stream(
                self.assistant.stream_resume(
                    decisions=decisions,
                    thread_id=self.thread_id,
                    context=self.context,
                ),
                collected_tool_calls,
            )
            self.pending_interrupt = new_interrupt
            if new_interrupt:
                return

            if final_output:
                self.conversation_history.append(
                    {"role": "assistant", "content": final_output}
                )
{%- if cookiecutter.use_database %}
            if self.current_conversation_id and final_output:
                await persist_assistant_turn(
                    self.current_conversation_id,
                    final_output,
                    getattr(self.assistant, "model_name", None),
                    collected_tool_calls,
                )
{%- endif %}
            await send_event(
                self.websocket, "final_result", {"output": final_output}
            )
            await send_event(self.websocket, "complete", {})
        except Exception as e:
            logger.exception(f"Error resuming agent: {e}")
            await send_event(self.websocket, "error", {"message": str(e)})

    async def _handle_message(self, data: dict[str, Any]) -> None:
        """Process a regular user message (may produce an interrupt)."""
        user_message = data.get("message", "")
        file_ids = data.get("file_ids", [])

        # Optionally accept history from client (or use server-side tracking)
        if "history" in data:
            self.conversation_history[:] = data["history"]

        if not user_message and not file_ids:
            await send_event(self.websocket, "error", {"message": "Empty message"})
            return

        # Reset usage tracking for the new turn (drive_stream accumulates across resumes).
        self._last_usage_metadata = None
        # Per-turn flag for the reasoning fallback in _stream_update_event.
        self._thinking_streamed = False

        # Re-instantiate the assistant if the client toggled thinking effort
        # between turns. The graph caches the model with thinking baked in, so
        # we rebuild lazily to honor the new setting.
        new_thinking_effort = data.get("thinking_effort")
        if new_thinking_effort != self._current_thinking_effort:
            self.assistant = get_agent(thinking_effort=new_thinking_effort)
            self._current_thinking_effort = new_thinking_effort

{%- if cookiecutter.use_database %}
        self.current_conversation_id, newly_created, organization_id = await persist_user_turn(
{%- if cookiecutter.websocket_auth_jwt %}
            self.user,
{%- endif %}
            user_message,
            file_ids,
            requested_conversation_id=data.get("conversation_id"),
            current_conversation_id=self.current_conversation_id,
        )
        if newly_created and self.current_conversation_id:
            await send_event(
                self.websocket,
                "conversation_created",
                {"conversation_id": self.current_conversation_id},
            )
{%- endif %}

        await send_event(self.websocket, "user_prompt", {"content": user_message})

        try:
{%- if cookiecutter.use_postgresql or cookiecutter.use_sqlite %}
            agent_input = await self._build_agent_input(user_message, file_ids)
{%- else %}
            agent_input = user_message
{%- endif %}

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
            from app.agents.tools.rag_tool import _active_kb_collections
            kb_names = await resolve_kb_collections(
{%- if cookiecutter.use_database %}
                self.current_conversation_id,
{%- else %}
                None,
{%- endif %}
{%- if cookiecutter.websocket_auth_jwt %}
{%- if cookiecutter.use_postgresql %}
                self.user.id,
{%- else %}
                str(self.user.id),
{%- endif %}
{%- endif %}
                override_kb_ids=(
                    [str(i) for i in (data.get("active_knowledge_base_ids") or [])]
                    if "active_knowledge_base_ids" in data and isinstance(data.get("active_knowledge_base_ids"), list)
                    else None
                ),
{%- if cookiecutter.enable_teams and cookiecutter.use_database %}
                organization_id=str(organization_id) if organization_id else None,
{%- endif %}
            )
            kb_token = _active_kb_collections.set(kb_names)
            try:
                await send_event(self.websocket, "model_request_start", {})
                collected_tool_calls: list[dict[str, Any]] = []
                final_output, pending_interrupt = await self._drive_stream(
                    self.assistant.stream(
                        agent_input,
                        history=self.conversation_history,
                        context=self.context,
                        thread_id=self.thread_id,
                    ),
                    collected_tool_calls,
                )
            finally:
                _active_kb_collections.reset(kb_token)
{%- else %}
            await send_event(self.websocket, "model_request_start", {})
            collected_tool_calls: list[dict[str, Any]] = []
            final_output, pending_interrupt = await self._drive_stream(
                self.assistant.stream(
                    agent_input,
                    history=self.conversation_history,
                    context=self.context,
                    thread_id=self.thread_id,
                ),
                collected_tool_calls,
            )
{%- endif %}

            self.pending_interrupt = pending_interrupt
            if pending_interrupt:
                return

            await send_event(self.websocket, "final_result", {"output": final_output})

            if final_output:
                self.conversation_history.append({"role": "user", "content": user_message})
                self.conversation_history.append(
                    {"role": "assistant", "content": final_output}
                )

{%- if cookiecutter.use_database %}
            assistant_msg_id: str | None = None
            if self.current_conversation_id and final_output:
                assistant_msg_id = await persist_assistant_turn(
                    self.current_conversation_id,
                    final_output,
                    getattr(self.assistant, "model_name", None),
                    collected_tool_calls,
                )

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
            # Record usage + debit credits (best-effort).
            if final_output and organization_id and getattr(self, "_last_usage_metadata", None):
                await self._record_usage(
                    organization_id=organization_id,
                    usage_metadata=self._last_usage_metadata,
                )
{%- endif %}

            if assistant_msg_id:
                await send_event(
                    self.websocket,
                    "message_saved",
                    {
                        "message_id": assistant_msg_id,
                        "conversation_id": self.current_conversation_id,
                    },
                )

            await send_event(
                self.websocket,
                "complete",
                {"conversation_id": self.current_conversation_id},
            )
{%- else %}
            await send_event(self.websocket, "complete", {})
{%- endif %}
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.exception(f"Error processing agent request: {e}")
            await send_event(self.websocket, "error", {"message": str(e)})

{%- if cookiecutter.enable_billing and cookiecutter.enable_teams and cookiecutter.enable_credits_system and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
    async def _record_usage(
        self,
        *,
        organization_id: Any,
        usage_metadata: Any,
    ) -> None:
        """Persist a UsageEvent + debit credits using LangChain UsageMetadata."""
        if not usage_metadata:
            return
        input_tokens = int(usage_metadata.get("input_tokens") or 0)
        output_tokens = int(usage_metadata.get("output_tokens") or 0)
        cached_tokens = int(
            (usage_metadata.get("input_token_details") or {}).get("cache_read") or 0
        )
        if input_tokens == 0 and output_tokens == 0:
            return

        from uuid import UUID

        try:
            org_uuid = (
                organization_id
                if isinstance(organization_id, UUID)
                else UUID(str(organization_id))
            )
        except Exception:
            return

        conv_uuid: UUID | None = None
        if self.current_conversation_id:
            try:
                conv_uuid = UUID(self.current_conversation_id)
            except Exception:
                conv_uuid = None

        try:
            async with get_db_context() as db:
                await UsageService(db).record(
                    organization_id=org_uuid,
                    actor_user_id=self.user.id,
                    conversation_id=conv_uuid,
                    model=getattr(self.assistant, "model_name", "") or "",
                    provider="{{ cookiecutter.llm_provider }}",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cached_tokens=cached_tokens,
                    ai_framework="deepagents",
                )
        except Exception:
            logger.exception("usage_record_failed")
{%- endif %}

    async def _drive_stream(
        self,
        stream_iter: Any,
        collected_tool_calls: list[dict[str, Any]],
    ) -> tuple[str, InterruptData | None]:
        """Drive a DeepAgents stream iterator. Returns ``(final_output, pending_interrupt)``."""
        final_output = ""
        seen_tool_call_ids: set[str] = set()
        pending: dict[str, dict[str, Any]] = {}
        pending_interrupt: InterruptData | None = None
        # Sum usage_metadata across the turn's model calls (and across HITL
        # resumes — `_drive_stream` runs multiple times per turn). We add only
        # the usage dicts (via add_usage), never whole chunks: merging full
        # AIMessageChunks via `+` crashes on scalar additional_kwargs like the
        # OpenAI Responses API's float ``created_at``.
        if not hasattr(self, "_last_usage_metadata"):
            self._last_usage_metadata = None

        async for stream_mode, stream_data in stream_iter:
            if stream_mode == "interrupt":
                pending_interrupt = stream_data
                await send_event(
                    self.websocket,
                    "tool_approval_required",
                    {
                        "action_requests": pending_interrupt["action_requests"],
                        "review_configs": pending_interrupt["review_configs"],
                    },
                )
                break

            if stream_mode == "messages":
                chunk, _metadata = stream_data
                if isinstance(chunk, AIMessageChunk):
                    if chunk.usage_metadata:
                        self._last_usage_metadata = (
                            chunk.usage_metadata
                            if self._last_usage_metadata is None
                            else add_usage(self._last_usage_metadata, chunk.usage_metadata)
                        )
                    final_output += await self._stream_message_chunk(chunk)
            elif stream_mode == "updates":
                await self._stream_update_event(
                    stream_data, seen_tool_call_ids, pending, collected_tool_calls
                )

        return final_output, pending_interrupt

    @staticmethod
    def _extract_reasoning(message: Any) -> str:
        """Pull reasoning/thinking text from a LangChain message or chunk.

        Covers three shapes:
          * Anthropic extended thinking — ``{"type":"thinking","thinking":"..."}``
          * OpenAI Responses API — ``{"type":"reasoning","summary":[{"type":"summary_text","text":"..."}]}``
          * Legacy providers — ``additional_kwargs.reasoning_content`` (string)
        """
        out = ""
        content = getattr(message, "content", None)
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "thinking":
                    out += block.get("thinking", "") or ""
                elif btype == "reasoning":
                    for summary in block.get("summary", []) or []:
                        if (
                            isinstance(summary, dict)
                            and summary.get("type") == "summary_text"
                        ):
                            out += summary.get("text", "") or ""
        legacy = (getattr(message, "additional_kwargs", None) or {}).get(
            "reasoning_content"
        )
        if isinstance(legacy, str):
            out += legacy
        return out

    async def _stream_message_chunk(self, chunk: AIMessageChunk) -> str:
        """Emit text + reasoning deltas from a streaming chunk.

        Tool calls are intentionally NOT emitted here. Streamed
        ``tool_call_chunks`` carry only partial JSON-string argument
        fragments, not a usable args dict — emitting from here produced
        ``tool_call`` events with empty ``args`` (and, because they were
        deduped against the same id set, suppressed the complete event).
        The canonical tool call, with full args, is emitted from the
        ``updates`` stream in ``_stream_update_event``.
        """
        text_content = ""
        if chunk.content:
            if isinstance(chunk.content, str):
                text_content = chunk.content
            elif isinstance(chunk.content, list):
                for block in chunk.content:
                    if isinstance(block, str):
                        text_content += block
                    elif isinstance(block, dict) and block.get("type") == "text":
                        text_content += block.get("text", "")
            if text_content:
                await send_event(self.websocket, "text_delta", {"content": text_content})

        reasoning_content = self._extract_reasoning(chunk)
        if reasoning_content:
            self._thinking_streamed = True
            await send_event(
                self.websocket, "thinking_delta", {"content": reasoning_content}
            )
        return text_content

    async def _stream_update_event(
        self,
        update_data: dict[str, Any],
        seen_tool_call_ids: set[str],
        pending: dict[str, dict[str, Any]],
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Process LangGraph ``updates`` events — the source of truth for tools.

        Tool calls here carry the complete name + parsed ``args`` from
        ``AIMessage.tool_calls`` (unlike the partial streamed chunks). Also
        emits a reasoning fallback for providers that attach the chain of
        thought to the final message instead of streaming it.
        """
        for node_name, update in update_data.items():
            if node_name == "tools":
                for msg in update.get("messages", []):
                    if isinstance(msg, ToolMessage):
                        tc = pending.get(msg.tool_call_id)
                        if tc is not None:
                            tc["result"] = str(msg.content)
                        await send_event(
                            self.websocket,
                            "tool_result",
                            {"tool_call_id": msg.tool_call_id, "content": msg.content},
                        )
            # DeepAgents' create_deep_agent delegates to LangChain
            # create_agent, whose model node is named "model" (not "agent"
            # like the hand-built LangGraph graph). Middleware nodes
            # (TodoListMiddleware.after_model, ...) are ignored.
            elif node_name == "model":
                for msg in update.get("messages", []):
                    if not isinstance(msg, AIMessage):
                        continue
                    if not self._thinking_streamed:
                        reasoning = self._extract_reasoning(msg)
                        if reasoning:
                            self._thinking_streamed = True
                            await send_event(
                                self.websocket,
                                "thinking_delta",
                                {"content": reasoning},
                            )
                    for tc_in in msg.tool_calls or []:
                        tc_id = tc_in.get("id", "")
                        if not tc_id:
                            continue
                        tc = {
                            "tool_call_id": tc_id,
                            "tool_name": tc_in.get("name", ""),
                            "args": tc_in.get("args", {}),
                        }
                        pending[tc_id] = tc
                        collected_tool_calls.append(tc)
                        if tc_id not in seen_tool_call_ids:
                            seen_tool_call_ids.add(tc_id)
                            await send_event(self.websocket, "tool_call", tc)

{%- if cookiecutter.use_postgresql or cookiecutter.use_sqlite %}

    async def _build_agent_input(self, user_message: str, file_ids: list[Any]) -> str:
        """Fold attached file content into the user message as a plain-text suffix."""
        if not file_ids:
            return user_message

        file_refs: list[str] = []
{%- if cookiecutter.use_postgresql %}
        async with get_db_context() as file_db:
            attached_files = await get_conversation_service(file_db).list_attached_files(file_ids)
            for chat_file in attached_files:
                if chat_file.parsed_content:
                    file_refs.append(
                        f"- {chat_file.filename}:\n```\n{chat_file.parsed_content}\n```"
                    )
                elif chat_file.file_type == "image":
                    file_refs.append(f"- {chat_file.filename} (image file)")
                else:
                    file_refs.append(f"- {chat_file.filename} (binary file)")
{%- else %}
        with contextmanager(get_db_session)() as file_db:
            attached_files = get_conversation_service(file_db).list_attached_files(file_ids)
            for chat_file in attached_files:
                if chat_file.parsed_content:
                    file_refs.append(
                        f"- {chat_file.filename}:\n```\n{chat_file.parsed_content}\n```"
                    )
                elif chat_file.file_type == "image":
                    file_refs.append(f"- {chat_file.filename} (image file)")
                else:
                    file_refs.append(f"- {chat_file.filename} (binary file)")
{%- endif %}

        if file_refs:
            return user_message + "\n\nAttached files:\n" + "\n".join(file_refs)
        return user_message
{%- endif %}
{%- elif cookiecutter.use_pydantic_deep %}
"""Per-connection AI agent session (PydanticDeep).

PydanticDeep manages conversation history internally via the backend
(history_messages_path), so this session does not maintain ``conversation_history``.
"""

import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from pydantic_ai import (
    Agent,
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartStartEvent,
    TextPartDelta,
    ToolCallPartDelta,
)
from pydantic_ai.messages import BinaryContent, TextPart, ThinkingPart, ThinkingPartDelta

from app.agents.pydantic_deep_assistant import PydanticDeepContext, get_agent
from app.services.agent import (
{%- if cookiecutter.use_database %}
    persist_assistant_turn,
    persist_user_turn,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
    resolve_kb_collections,
{%- endif %}
    send_event,
)
{%- if cookiecutter.websocket_auth_jwt %}
from app.db.models.user import User
{%- endif %}
{%- if (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
from app.api.deps import get_conversation_service
from app.db.session import get_db_context{% if cookiecutter.use_sqlite %}, get_db_session
from contextlib import contextmanager{% endif %}
from app.services.file_storage import get_file_storage
{%- endif %}

logger = logging.getLogger(__name__)


class AgentSession:
    """One WebSocket session with the PydanticDeep agent."""

    def __init__(
        self,
        websocket: WebSocket,
{%- if cookiecutter.websocket_auth_jwt %}
        user: User,
{%- endif %}
    ) -> None:
        self.websocket = websocket
{%- if cookiecutter.websocket_auth_jwt %}
        self.user = user
{%- endif %}
        self.context: PydanticDeepContext = {}
{%- if cookiecutter.websocket_auth_jwt %}
        self.context["user_id"] = str(user.id) if user else None
        self.context["user_name"] = user.email if user else None
{%- endif %}
{%- if cookiecutter.use_database %}
        self.current_conversation_id: str | None = None
{%- endif %}

    async def process_message(self, data: dict[str, Any]) -> None:
        """Process one user turn: persist input, run the agent, stream events, persist output."""
        user_message = data.get("message", "")
        file_ids = data.get("file_ids", [])

        if not user_message and not file_ids:
            await send_event(self.websocket, "error", {"message": "Empty message"})
            return

{%- if cookiecutter.use_database %}
        self.current_conversation_id, newly_created, organization_id = await persist_user_turn(
{%- if cookiecutter.websocket_auth_jwt %}
            self.user,
{%- endif %}
            user_message,
            file_ids,
            requested_conversation_id=data.get("conversation_id"),
            current_conversation_id=self.current_conversation_id,
        )
        if newly_created and self.current_conversation_id:
            await send_event(
                self.websocket,
                "conversation_created",
                {"conversation_id": self.current_conversation_id},
            )
{%- endif %}

        await send_event(self.websocket, "user_prompt", {"content": user_message})

        try:
            assistant = get_agent(
                model_name=data.get("model"),
                thinking_effort=data.get("thinking_effort"),
{%- if cookiecutter.use_database %}
                conversation_id=self.current_conversation_id or "default",
{%- else %}
                conversation_id="default",
{%- endif %}
{%- if cookiecutter.websocket_auth_jwt %}
                user_id=self.context.get("user_id"),
                user_name=self.context.get("user_name"),
{%- endif %}
            )

{%- if cookiecutter.use_postgresql or cookiecutter.use_sqlite %}
            user_input = await self._build_agent_input(user_message, file_ids, assistant)
{%- else %}
            user_input = user_message
{%- endif %}

{%- if cookiecutter.enable_teams and cookiecutter.enable_rag %}
            from app.agents.tools.rag_tool import _active_kb_collections
            kb_names = await resolve_kb_collections(
{%- if cookiecutter.use_database %}
                self.current_conversation_id,
{%- else %}
                None,
{%- endif %}
{%- if cookiecutter.websocket_auth_jwt %}
{%- if cookiecutter.use_postgresql %}
                self.user.id,
{%- else %}
                str(self.user.id),
{%- endif %}
{%- endif %}
                override_kb_ids=(
                    [str(i) for i in (data.get("active_knowledge_base_ids") or [])]
                    if "active_knowledge_base_ids" in data and isinstance(data.get("active_knowledge_base_ids"), list)
                    else None
                ),
{%- if cookiecutter.enable_teams and cookiecutter.use_database %}
                organization_id=str(organization_id) if organization_id else None,
{%- endif %}
            )
            kb_token = _active_kb_collections.set(kb_names)
            try:
                collected_tool_calls: list[dict[str, Any]] = []
                async with assistant.agent.iter(user_input, deps=assistant.deps) as agent_run:
                    await self._stream_agent_run(
                        agent_run, user_message, collected_tool_calls
                    )
            finally:
                _active_kb_collections.reset(kb_token)
{%- else %}
            collected_tool_calls: list[dict[str, Any]] = []
            async with assistant.agent.iter(user_input, deps=assistant.deps) as agent_run:
                await self._stream_agent_run(
                    agent_run, user_message, collected_tool_calls
                )
{%- endif %}

{%- if cookiecutter.use_database %}
            if self.current_conversation_id and agent_run.result is not None:
                await persist_assistant_turn(
                    self.current_conversation_id,
                    agent_run.result.output,
                    getattr(assistant, "model_name", None),
                    collected_tool_calls,
                )

            await send_event(
                self.websocket,
                "complete",
                {"conversation_id": self.current_conversation_id},
            )
{%- else %}
            await send_event(self.websocket, "complete", {})
{%- endif %}
        except WebSocketDisconnect:
            raise
        except Exception as e:
            logger.exception(f"Error processing agent request: {e}")
            await send_event(self.websocket, "error", {"message": str(e)})

{%- if cookiecutter.use_postgresql or cookiecutter.use_sqlite %}

    async def _build_agent_input(
        self, user_message: str, file_ids: list[Any], assistant: Any
    ) -> str | list[Any]:
        """Fold attached files into the agent input.

        Sandbox backends (Docker/Daytona) get files written to the workspace and a path
        reference appended. ``StateBackend`` falls back to inline content. Images are
        always attached as ``BinaryContent`` parts for vision models.
        """
        if not file_ids:
            return user_message

        storage = get_file_storage()
        file_refs: list[str] = []
        image_parts: list[Any] = []

        backend = assistant.deps.backend
        has_sandbox = (
            hasattr(backend, "container_name")
            or hasattr(backend, "upload_bytes")
            or hasattr(backend, "workspace_id")
        )

        async def _process_files(attached_files: Any) -> None:
            for chat_file in attached_files:
                try:
                    rel_path = f"uploads/{chat_file.filename}"

                    if chat_file.file_type == "image":
                        file_data = await storage.load(chat_file.storage_path)
                        image_parts.append(
                            BinaryContent(data=file_data, media_type=chat_file.mime_type)
                        )
                        if has_sandbox:
                            await assistant.write_file_to_workspace(rel_path, file_data)
                            file_refs.append(
                                f"- {rel_path} (image, also attached inline for vision)"
                            )
                        else:
                            file_refs.append(
                                f"- {chat_file.filename} (image attached inline)"
                            )
                    elif chat_file.parsed_content:
                        if has_sandbox:
                            await assistant.write_file_to_workspace(
                                rel_path, chat_file.parsed_content
                            )
                            file_refs.append(f"- {rel_path}")
                        else:
                            file_refs.append(
                                f"- {chat_file.filename}:\n```\n{chat_file.parsed_content}\n```"
                            )
                    else:
                        file_data = await storage.load(chat_file.storage_path)
                        if has_sandbox:
                            await assistant.write_file_to_workspace(rel_path, file_data)
                            file_refs.append(f"- {rel_path}")
                        else:
                            file_refs.append(
                                f"- {chat_file.filename} (binary, not readable as text)"
                            )
                except Exception as e:
                    logger.warning(f"Failed to load file {chat_file.id}: {e}")

{%- if cookiecutter.use_postgresql %}
        async with get_db_context() as file_db:
            attached_files = await get_conversation_service(file_db).list_attached_files(file_ids)
            await _process_files(attached_files)
{%- else %}
        with contextmanager(get_db_session)() as file_db:
            attached_files = get_conversation_service(file_db).list_attached_files(file_ids)
            await _process_files(attached_files)
{%- endif %}

        if not file_refs:
            return user_message

        header = (
            "\n\nFiles uploaded to your sandbox workspace (use read_file to access):\n"
            if has_sandbox
            else "\n\nAttached files:\n"
        )
        augmented = user_message + header + "\n".join(file_refs)
        return [augmented, *image_parts] if image_parts else augmented
{%- endif %}

    async def _stream_agent_run(
        self,
        agent_run: Any,
        user_message: str,
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Drive the pydantic-ai agent_run iterator, forwarding all events."""
        async for node in agent_run:
            if Agent.is_user_prompt_node(node):
                prompt_text = (
                    node.user_prompt if isinstance(node.user_prompt, str) else user_message
                )
                await send_event(
                    self.websocket, "user_prompt_processed", {"prompt": prompt_text}
                )
            elif Agent.is_model_request_node(node):
                await send_event(self.websocket, "model_request_start", {})
                async with node.stream(agent_run.ctx) as request_stream:
                    await self._stream_request_events(request_stream)
            elif Agent.is_call_tools_node(node):
                await send_event(self.websocket, "call_tools_start", {})
                async with node.stream(agent_run.ctx) as handle_stream:
                    await self._stream_tool_events(handle_stream, collected_tool_calls)
            elif Agent.is_end_node(node) and agent_run.result is not None:
                await send_event(
                    self.websocket, "final_result", {"output": agent_run.result.output}
                )

    async def _stream_request_events(self, request_stream: Any) -> None:
        """Forward model-request events (text/thinking/tool deltas + final-result start)."""
        async for event in request_stream:
            if isinstance(event, PartStartEvent):
                await send_event(
                    self.websocket,
                    "part_start",
                    {"index": event.index, "part_type": type(event.part).__name__},
                )
                if isinstance(event.part, TextPart) and event.part.content:
                    await send_event(
                        self.websocket,
                        "text_delta",
                        {"index": event.index, "content": event.part.content},
                    )
                elif isinstance(event.part, ThinkingPart) and event.part.content:
                    # Surface the model's reasoning trace to the UI. Anthropic +
                    # OpenAI-reasoning models emit these as the model "thinks".
                    await send_event(
                        self.websocket,
                        "thinking_delta",
                        {"index": event.index, "content": event.part.content},
                    )
            elif isinstance(event, PartDeltaEvent):
                if isinstance(event.delta, TextPartDelta):
                    await send_event(
                        self.websocket,
                        "text_delta",
                        {"index": event.index, "content": event.delta.content_delta},
                    )
                elif isinstance(event.delta, ThinkingPartDelta):
                    if event.delta.content_delta:
                        await send_event(
                            self.websocket,
                            "thinking_delta",
                            {"index": event.index, "content": event.delta.content_delta},
                        )
                elif isinstance(event.delta, ToolCallPartDelta):
                    await send_event(
                        self.websocket,
                        "tool_call_delta",
                        {"index": event.index, "args_delta": event.delta.args_delta},
                    )
            elif isinstance(event, FinalResultEvent):
                await send_event(
                    self.websocket,
                    "final_result_start",
                    {"tool_name": event.tool_name},
                )

    async def _stream_tool_events(
        self,
        handle_stream: Any,
        collected_tool_calls: list[dict[str, Any]],
    ) -> None:
        """Forward tool-call/result events; collect tool calls (with results) for persistence."""
        pending: dict[str, dict[str, Any]] = {}
        async for tool_event in handle_stream:
            if isinstance(tool_event, FunctionToolCallEvent):
                tc = {
                    "tool_call_id": tool_event.part.tool_call_id,
                    "tool_name": tool_event.part.tool_name,
                    "args": tool_event.part.args,
                }
                collected_tool_calls.append(tc)
                pending[tool_event.part.tool_call_id] = tc
                await send_event(self.websocket, "tool_call", tc)
            elif isinstance(tool_event, FunctionToolResultEvent):
                tc = pending.get(tool_event.tool_call_id)
                if tc is not None:
                    tc["result"] = str(tool_event.result.content)
                await send_event(
                    self.websocket,
                    "tool_result",
                    {
                        "tool_call_id": tool_event.tool_call_id,
                        "content": str(tool_event.result.content),
                    },
                )
{%- else %}
"""AI Agent session - not configured."""
{%- endif %}
