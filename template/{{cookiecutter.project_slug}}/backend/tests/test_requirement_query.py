{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and cookiecutter.use_postgresql %}
"""Tests for grounded requirement query service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestRequirementAIService:
    """Requirement AI adapter should call an Anthropic Messages-compatible API."""

    def test_messages_payload_includes_system_prompt_and_model(self, monkeypatch):
        import json

        from app.services.requirement_ai import RequirementAIService

        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self):
                return json.dumps(
                    {
                        "content": [
                            {
                                "type": "text",
                                "text": "{\"markdown_content\":\"# 需求\\n\\n## 待澄清问题\\n- countries?\",\"clarification_questions\":[\"支持哪些countries?\"]}",
                            }
                        ]
                    }
                ).encode()

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            captured["headers"] = dict(request.header_items())
            captured["payload"] = json.loads(request.data.decode())
            return FakeResponse()

        monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
        service = RequirementAIService()
        service.base_url = "http://claude.purvar.local"
        service.token = "token"
        service.model = "deepseek-v4-pro[1m]"
        result = service._post_messages(
            {
                "model": service.model,
                "max_tokens": 100,
                "system": "system prompt",
                "messages": [{"role": "user", "content": "hello"}],
            }
        )

        assert "markdown_content" in result
        assert captured["url"] == "http://claude.purvar.local/v1/messages"
        assert captured["payload"]["model"] == "deepseek-v4-pro[1m]"
        assert captured["payload"]["system"] == "system prompt"
        assert captured["payload"]["messages"][0]["role"] == "user"
        assert captured["headers"]["Authorization"] == "Bearer token"

    @pytest.mark.anyio
    async def test_create_from_text_falls_back_to_available_model(self, monkeypatch):
        from io import BytesIO
        import json
        import urllib.error

        from app.services.requirement_ai import RequirementAIService

        calls = []

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, traceback):
                return False

            def read(self):
                return json.dumps(
                    {
                        "content": [
                            {
                                "type": "text",
                                "text": "{\"markdown_content\":\"# AI draft\",\"clarification_questions\":[\"Which countries?\"]}",
                            }
                        ]
                    }
                ).encode()

        def fake_urlopen(request, timeout):
            payload = json.loads(request.data.decode())
            calls.append(payload["model"])
            if payload["model"] == "deepseek-v4-pro[1m]":
                raise urllib.error.HTTPError(
                    request.full_url,
                    503,
                    "Service Unavailable",
                    {},
                    BytesIO(b'{"error":{"message":"No available accounts"}}'),
                )
            return FakeResponse()

        monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
        service = RequirementAIService()
        service.base_url = "http://claude.purvar.local"
        service.token = "token"
        service.model = "deepseek-v4-pro[1m]"
        service.fallback_models = ["deepseek-v4-flash"]

        result = await service.create_from_text(title="Overseas address", description="support")

        assert result is not None
        assert result.markdown_content == "# AI draft"
        assert service.model == "deepseek-v4-flash"
        assert calls == ["deepseek-v4-pro[1m]", "deepseek-v4-flash"]


class TestRequirementQueryService:
    """Requirement queries should cite stored Markdown originals."""

    @pytest.mark.anyio
    async def test_query_uses_markdown_content_and_source_label(self):
        import uuid

        from app.services.requirement_query import RequirementQueryService
        from app.services.rag.models import SearchResult

        kb_id = uuid.uuid4()
        tracked_doc = MagicMock()
        tracked_doc.id = uuid.uuid4()
        tracked_doc.filename = "orders-prd.docx"
        tracked_doc.markdown_content = (
            "# Orders\n\n"
            "## Overseas address\n\n"
            "Users can enter overseas shipping addresses during checkout."
        )

        retrieval = MagicMock()
        retrieval.retrieve = AsyncMock(
            return_value=[
                SearchResult(
                    content="Users can enter overseas shipping addresses during checkout.",
                    score=0.91,
                    metadata={"filename": "orders-prd.docx", "page_num": 1, "chunk_num": 2},
                    parent_doc_id="vector-doc-1",
                )
            ]
        )

        with patch(
            "app.repositories.rag_document_repo.get_latest_by_vector_document_id",
            new=AsyncMock(return_value=tracked_doc),
        ):
            service = RequirementQueryService(db=MagicMock(), retrieval_service=retrieval)
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_orders",
                query="海外地址怎么处理?",
            )

        assert result.is_grounded is True
        assert "Users can enter overseas shipping addresses" in result.answer
        assert "[来源: orders-prd.docx > page 1 > chunk 2]" in result.answer
        assert result.sources[0].filename == "orders-prd.docx"

    @pytest.mark.anyio
    async def test_query_falls_back_to_markdown_without_vector_hits(self):
        import uuid

        from app.services.requirement_query import RequirementQueryService

        kb_id = uuid.uuid4()
        tracked_doc = MagicMock()
        tracked_doc.id = uuid.uuid4()
        tracked_doc.filename = "address-prd.md"
        tracked_doc.vector_document_id = None
        tracked_doc.markdown_content = (
            "# Address\n\n"
            "## Overseas address\n\n"
            "The checkout address form supports Japan and Singapore."
        )

        with patch(
            "app.repositories.rag_document_repo.get_latest_markdown_for_kb",
            new=AsyncMock(return_value=[tracked_doc]),
        ):
            service = RequirementQueryService(db=MagicMock(), retrieval_service=None)
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_address",
                query="Japan Singapore",
            )

        assert result.is_grounded is True
        assert "Japan and Singapore" in result.answer
        assert result.sources[0].label == "address-prd.md > Overseas address"

    @pytest.mark.anyio
    async def test_query_falls_back_to_chinese_markdown_terms(self):
        import uuid

        from app.services.requirement_query import RequirementQueryService

        kb_id = uuid.uuid4()
        tracked_doc = MagicMock()
        tracked_doc.id = uuid.uuid4()
        tracked_doc.filename = "海外地址.md"
        tracked_doc.vector_document_id = None
        tracked_doc.markdown_content = (
            "# 海外收货地址支持\n\n"
            "## 原始描述\n\n"
            "用户收货地址要支持海外地址\n\n"
            "## 待澄清问题\n\n"
            "- 需要支持哪些国家或地区, 地址字段格式是否不同?"
        )

        with patch(
            "app.repositories.rag_document_repo.get_latest_markdown_for_kb",
            new=AsyncMock(return_value=[tracked_doc]),
        ):
            service = RequirementQueryService(db=MagicMock(), retrieval_service=None)
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_address",
                query="海外地址需要澄清哪些规则?",
            )

        assert result.is_grounded is True
        assert "海外地址" in result.answer
        assert result.sources[0].label.startswith("海外地址.md")

    @pytest.mark.anyio
    async def test_query_prioritizes_clarification_answers(self):
        import uuid

        from app.services.requirement_query import RequirementQueryService

        kb_id = uuid.uuid4()
        tracked_doc = MagicMock()
        tracked_doc.id = uuid.uuid4()
        tracked_doc.filename = "海外地址.md"
        tracked_doc.vector_document_id = None
        tracked_doc.markdown_content = (
            "# 海外收货地址支持\n\n"
            "## 待澄清问题\n\n"
            "- 需要支持哪些国家或地区, 地址字段格式是否不同?\n\n"
            "## 变更说明\n\n"
            "- 根据以下澄清回答更新需求文档:\n"
            "  - 需要支持哪些国家或地区, 地址字段格式是否不同?\n"
            "    回答: MVP 阶段支持美国、日本和新加坡, 地址字段按国家展示必填项。\n"
        )

        with patch(
            "app.repositories.rag_document_repo.get_latest_markdown_for_kb",
            new=AsyncMock(return_value=[tracked_doc]),
        ):
            service = RequirementQueryService(db=MagicMock(), retrieval_service=None)
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_address",
                query="支持哪些countries?",
            )

        assert result.is_grounded is True
        assert "美国、日本和新加坡" in result.answer
        assert result.sources[0].label == "海外地址.md > 变更说明"


class TestRequirementWorkflowService:
    """Requirement workflow helpers should be deterministic and role-aware."""

    @pytest.mark.anyio
    async def test_create_from_text_persists_markdown_and_questions(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService

        kb = MagicMock()
        kb.id = uuid.uuid4()
        kb.collection_name = "kb_orders"
        created_doc = MagicMock()
        created_doc.id = uuid.uuid4()
        created_doc.filename = "overseas-address.md"

        with patch(
            "app.repositories.rag_document_repo.create",
            new=AsyncMock(return_value=created_doc),
        ) as create_doc:
            service = RequirementWorkflowService(db=MagicMock())
            result = await service.create_from_text(
                kb=kb,
                description="用户收货地址要支持海外地址",
                title="overseas address",
                filename="overseas-address.md",
                user_id=uuid.uuid4(),
                organization_id=uuid.uuid4(),
            )

        assert "用户收货地址要支持海外地址" in result.markdown_content
        assert result.clarification_questions
        assert result.notification_event is not None
        create_doc.assert_awaited_once()

    @pytest.mark.anyio
    async def test_developer_change_creates_reviewable_draft(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        doc = MagicMock()
        doc.id = uuid.uuid4()
        doc.knowledge_base_id = kb_id
        doc.collection_name = "kb_orders"
        doc.filename = "orders.md"
        doc.filetype = "md"
        doc.storage_path = ""
        doc.markdown_content = "# Orders"
        doc.version = 1
        doc.organization_id = uuid.uuid4()

        draft = MagicMock()
        draft.id = uuid.uuid4()
        draft.filename = doc.filename
        draft.version = 2

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=doc)),
            patch("app.repositories.rag_document_repo.create", new=AsyncMock(return_value=draft)) as create_doc,
        ):
            service = RequirementWorkflowService(db=MagicMock())
            result = await service.change_document(
                kb_id=kb_id,
                doc_id=doc.id,
                instruction="建议补充海外地址校验",
                apply=True,
                user_id=uuid.uuid4(),
                role="developer",
                is_app_admin=False,
            )

        assert result.action == "draft_created"
        assert result.document_id == str(draft.id)
        assert result.previous_document_id == str(doc.id)
        assert "等待产品确认" in result.message
        create_doc.assert_awaited_once()
        assert create_doc.await_args.kwargs["status"] == "draft"
        assert create_doc.await_args.kwargs["is_latest"] is False

    @pytest.mark.anyio
    async def test_product_apply_change_creates_latest_version(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        old_doc = MagicMock()
        old_doc.id = uuid.uuid4()
        old_doc.knowledge_base_id = kb_id
        old_doc.collection_name = "kb_orders"
        old_doc.filename = "orders.md"
        old_doc.filetype = "md"
        old_doc.storage_path = ""
        old_doc.markdown_content = "# Orders"
        old_doc.version = 1
        old_doc.chunk_count = 1
        old_doc.organization_id = uuid.uuid4()

        new_doc = MagicMock()
        new_doc.id = uuid.uuid4()
        new_doc.filename = old_doc.filename
        new_doc.version = 2

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=old_doc)),
            patch("app.repositories.rag_document_repo.mark_not_latest", new=AsyncMock()),
            patch("app.repositories.rag_document_repo.create", new=AsyncMock(return_value=new_doc)),
        ):
            service = RequirementWorkflowService(db=MagicMock())
            result = await service.change_document(
                kb_id=kb_id,
                doc_id=old_doc.id,
                instruction="补充海外地址校验",
                apply=True,
                user_id=uuid.uuid4(),
                role="product",
                is_app_admin=False,
            )

        assert result.action == "version_created"
        assert result.document_id == str(new_doc.id)
        assert result.previous_document_id == str(old_doc.id)

    @pytest.mark.anyio
    async def test_product_applies_draft_as_latest_version(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        previous_id = uuid.uuid4()
        draft = MagicMock()
        draft.id = uuid.uuid4()
        draft.knowledge_base_id = kb_id
        draft.previous_version_id = previous_id
        draft.filename = "orders.md"
        draft.status = "draft"
        draft.version = 2
        draft.markdown_content = "# Orders\n\n- 海外地址"

        db = MagicMock()
        db.flush = AsyncMock()

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=draft)),
            patch("app.repositories.rag_document_repo.mark_not_latest", new=AsyncMock()) as mark_old,
        ):
            service = RequirementWorkflowService(db=db)
            result = await service.apply_draft(
                kb_id=kb_id,
                draft_doc_id=draft.id,
                user_id=uuid.uuid4(),
                role="product",
                is_app_admin=False,
            )

        assert result.action == "draft_applied"
        assert result.document_id == str(draft.id)
        assert draft.status == "done"
        assert draft.is_latest is True
        mark_old.assert_awaited_once()
        db.flush.assert_awaited_once()

    @pytest.mark.anyio
    async def test_requirement_notification_helper_broadcasts_payload(self):
        import uuid

        from app.api.routes.v1.knowledge_bases import _broadcast_requirement_event
        from app.schemas.rag import RequirementChangeResponse, RequirementNotificationEvent

        event = RequirementNotificationEvent(
            event_type="requirement.version_created",
            kb_id=str(uuid.uuid4()),
            document_id=str(uuid.uuid4()),
            filename="orders.md",
            message="orders.md 已更新到 v2.",
            version=2,
            status="done",
            diff_summary="新增海外地址规则.",
        )
        response = RequirementChangeResponse(
            action="version_created",
            message="done",
            notification_event=event,
        )

        with patch(
            "app.api.routes.v1.knowledge_bases.agent_connection_manager.broadcast_event",
            new=AsyncMock(return_value=1),
        ) as broadcast:
            await _broadcast_requirement_event(response)

        broadcast.assert_awaited_once_with("requirement_notification", event.model_dump())

    @pytest.mark.anyio
    async def test_diff_document_versions_returns_unified_diff(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        old_doc = MagicMock()
        old_doc.id = uuid.uuid4()
        old_doc.filename = "orders.md"
        old_doc.version = 1
        old_doc.markdown_content = "# Orders\n\n- 国内地址"

        new_doc = MagicMock()
        new_doc.id = uuid.uuid4()
        new_doc.filename = "orders.md"
        new_doc.version = 2
        new_doc.markdown_content = "# Orders\n\n- 国内地址\n- 海外地址"

        with patch(
            "app.repositories.rag_document_repo.get_version_chain_for_document",
            new=AsyncMock(return_value=[new_doc, old_doc]),
        ):
            service = RequirementWorkflowService(db=MagicMock())
            result = await service.diff_document_versions(
                kb_id=kb_id,
                doc_id=new_doc.id,
            )

        assert result.from_version == 1
        assert result.to_version == 2
        assert "新增 1 行" in result.summary
        assert "+- 海外地址" in result.diff_lines


{%- else %}
"""Requirement query tests — not configured for this template combination."""
{%- endif %}
