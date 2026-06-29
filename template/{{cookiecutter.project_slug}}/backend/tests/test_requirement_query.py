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
        ), patch(
            "app.repositories.rag_document_repo.get_latest_markdown_for_kb",
            new=AsyncMock(return_value=[]),
        ):
            service = RequirementQueryService(db=MagicMock(), retrieval_service=retrieval)
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_orders",
                query="海外地址怎么处理?",
            )

        assert result.is_grounded is True
        assert result.grounding_status == "grounded"
        assert result.confidence == "high"
        assert result.facts
        assert "Users can enter overseas shipping addresses" in result.answer
        assert "[来源: orders-prd.docx > Overseas address > page 1 > chunk 2]" in result.answer
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
        assert result.grounding_status == "grounded"
        assert result.confidence == "high"
        assert "Japan and Singapore" in result.answer
        assert result.sources[0].label == "address-prd.md > Overseas address"

    @pytest.mark.anyio
    async def test_query_rejects_uncited_ai_answer(self):
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

        ai = MagicMock()
        ai.model = "test-model"
        ai.answer_query = AsyncMock(return_value="AI says the feature supports every country.")

        with patch(
            "app.repositories.rag_document_repo.get_latest_markdown_for_kb",
            new=AsyncMock(return_value=[tracked_doc]),
        ):
            service = RequirementQueryService(
                db=MagicMock(),
                retrieval_service=None,
                ai_service=ai,
            )
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_address",
                query="Japan Singapore",
            )

        assert result.ai_used is False
        assert result.ai_error == "AI answer was ignored because it did not cite provided sources."
        assert "every country" not in result.answer
        assert "Japan and Singapore" in result.answer

    @pytest.mark.anyio
    async def test_query_low_confidence_vector_hit_needs_confirmation(self):
        import uuid

        from app.services.requirement_query import RequirementQueryService
        from app.services.rag.models import SearchResult

        kb_id = uuid.uuid4()
        retrieval = MagicMock()
        retrieval.retrieve = AsyncMock(
            return_value=[
                SearchResult(
                    content="Maybe related chunk without stored Markdown.",
                    score=0.42,
                    metadata={"filename": "legacy.pdf", "chunk_num": 3},
                    parent_doc_id="old-vector-doc",
                )
            ]
        )

        with (
            patch(
                "app.repositories.rag_document_repo.get_latest_by_vector_document_id",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "app.repositories.rag_document_repo.get_latest_markdown_for_kb",
                new=AsyncMock(return_value=[]),
            ),
        ):
            service = RequirementQueryService(db=MagicMock(), retrieval_service=retrieval)
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_legacy",
                query="海外地址支持哪些国家?",
            )

        assert result.is_grounded is False
        assert result.grounding_status == "low_confidence"
        assert result.confidence == "low"
        assert result.inferences
        assert result.follow_up_questions
        assert "不能作为确定需求结论" in result.answer

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

    @pytest.mark.anyio
    async def test_tester_query_returns_source_bound_test_focus(self):
        import uuid

        from app.services.requirement_query import RequirementQueryService

        kb_id = uuid.uuid4()
        tracked_doc = MagicMock()
        tracked_doc.id = uuid.uuid4()
        tracked_doc.filename = "结算地址.md"
        tracked_doc.vector_document_id = None
        tracked_doc.markdown_content = (
            "# 结算地址\n\n"
            "## 海外地址校验\n\n"
            "MVP 支持美国、日本和新加坡地址, 邮编和省州字段按国家展示必填项。"
        )

        with patch(
            "app.repositories.rag_document_repo.get_latest_markdown_for_kb",
            new=AsyncMock(return_value=[tracked_doc]),
        ):
            service = RequirementQueryService(db=MagicMock(), retrieval_service=None)
            result = await service.query_kb(
                kb_id=kb_id,
                collection_name="kb_address",
                query="tester 需要覆盖哪些地址校验?",
                role="tester",
            )

        assert result.is_grounded is True
        assert result.test_focus
        assert "海外地址校验" in result.test_focus[0]
        assert "来源: 结算地址.md > 海外地址校验" in result.test_focus[0]
        assert "测试关注点" in result.answer


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
        ) as create_doc, patch(
            "app.services.requirement_workflow.record_audit",
            new=AsyncMock(),
        ) as audit:
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
        audit.assert_awaited_once()
        assert audit.await_args.kwargs["action"] == "requirement.clarification_started"
        assert audit.await_args.kwargs["details"]["state"] == "clarifying"

    @pytest.mark.anyio
    async def test_create_from_text_records_clarification_session(self):
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
        ), patch(
            "app.services.requirement_workflow.record_audit",
            new=AsyncMock(),
        ) as audit:
            service = RequirementWorkflowService(db=MagicMock())
            await service.create_from_text(
                kb=kb,
                description="用户收货地址要支持海外地址",
                title="overseas address",
                filename="overseas-address.md",
                user_id=uuid.uuid4(),
                organization_id=uuid.uuid4(),
            )

        assert audit.await_args.kwargs["action"] == "requirement.clarification_started"
        details = audit.await_args.kwargs["details"]
        assert details["knowledge_base_id"] == str(kb.id)
        assert details["document_id"] == str(created_doc.id)
        assert details["questions"]
        assert details["state"] == "clarifying"

    @pytest.mark.anyio
    async def test_answer_clarifications_records_round_and_updates_requirement(self):
        import uuid

        from app.schemas.rag import RequirementClarificationAnswer
        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
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
        old_doc.organization_id = org_id
        old_doc.vector_document_id = None
        old_doc.status = "done"

        new_doc = MagicMock()
        new_doc.id = uuid.uuid4()
        new_doc.knowledge_base_id = kb_id
        new_doc.collection_name = old_doc.collection_name
        new_doc.filename = old_doc.filename
        new_doc.version = 2
        new_doc.markdown_content = ""
        new_doc.status = "done"

        empty_scalars = MagicMock()
        empty_scalars.all.return_value = []
        db = MagicMock()
        db.flush = AsyncMock()
        db.execute = AsyncMock(
            return_value=MagicMock(scalars=MagicMock(return_value=empty_scalars))
        )

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=old_doc)),
            patch("app.repositories.rag_document_repo.mark_not_latest", new=AsyncMock()),
            patch("app.repositories.rag_document_repo.create", new=AsyncMock(return_value=new_doc)),
            patch(
                "app.services.requirement_workflow.record_audit",
                new=AsyncMock(),
            ) as audit,
        ):
            service = RequirementWorkflowService(db=db)
            result = await service.answer_clarifications(
                kb_id=kb_id,
                doc_id=old_doc.id,
                answers=[
                    RequirementClarificationAnswer(
                        question="支持哪些国家?",
                        answer="MVP 支持美国、日本和新加坡。",
                    )
                ],
                apply=True,
                user_id=user_id,
                role="product",
                is_app_admin=False,
                organization_id=org_id,
            )

        assert result.change is not None
        assert result.change.action == "version_created"
        assert result.change.document_id == str(new_doc.id)
        assert audit.await_count == 2
        assert audit.await_args_list[0].kwargs["action"] == "requirement.clarification_answered"
        assert audit.await_args_list[0].kwargs["details"]["round"] == 1
        assert audit.await_args_list[0].kwargs["details"]["answers"][0]["answer"] == "MVP 支持美国、日本和新加坡。"
        assert audit.await_args_list[1].kwargs["action"] == "requirement.version_created"

    @pytest.mark.anyio
    async def test_developer_change_records_suggestion_only(self):
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

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=doc)),
            patch("app.repositories.rag_document_repo.create", new=AsyncMock()) as create_doc,
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

        assert result.action == "suggestion_recorded"
        assert result.document_id is None
        assert result.previous_document_id == str(doc.id)
        assert "需要产品确认" in result.message
        create_doc.assert_not_awaited()

    @pytest.mark.anyio
    async def test_tester_change_records_suggestion_only(self):
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

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=doc)),
            patch("app.repositories.rag_document_repo.create", new=AsyncMock()) as create_doc,
        ):
            service = RequirementWorkflowService(db=MagicMock())
            result = await service.change_document(
                kb_id=kb_id,
                doc_id=doc.id,
                instruction="建议补充边界值和异常提示",
                apply=True,
                user_id=uuid.uuid4(),
                role="tester",
                is_app_admin=False,
            )

        assert result.action == "suggestion_recorded"
        assert result.document_id is None
        assert result.previous_document_id == str(doc.id)
        assert "需要产品确认" in result.message
        create_doc.assert_not_awaited()

    @pytest.mark.anyio
    async def test_product_apply_change_creates_latest_version(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService
        from app.services.rag.models import IngestionResult, IngestionStatus

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
        old_doc.vector_document_id = "vector-v1"

        new_doc = MagicMock()
        new_doc.id = uuid.uuid4()
        new_doc.knowledge_base_id = kb_id
        new_doc.collection_name = old_doc.collection_name
        new_doc.filename = old_doc.filename
        new_doc.version = 2
        new_doc.markdown_content = "# Orders\n\n## 变更说明\n\n- 补充海外地址校验"

        ingestion = MagicMock()
        ingestion.ingest_file = AsyncMock(
            return_value=IngestionResult(
                status=IngestionStatus.DONE,
                document_id="vector-v2",
                chunk_count=3,
            )
        )
        ingestion.remove_document = AsyncMock(return_value=True)

        db = MagicMock()
        db.flush = AsyncMock()

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=old_doc)),
            patch("app.repositories.rag_document_repo.mark_not_latest", new=AsyncMock()),
            patch("app.repositories.rag_document_repo.create", new=AsyncMock(return_value=new_doc)),
            patch(
                "app.services.requirement_workflow.record_audit",
                new=AsyncMock(),
            ) as audit,
        ):
            service = RequirementWorkflowService(db=db, ingestion_service=ingestion)
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
        assert new_doc.vector_document_id == "vector-v2"
        assert new_doc.chunk_count == 3
        ingestion.ingest_file.assert_awaited_once()
        ingestion.remove_document.assert_awaited_once_with("kb_orders", "vector-v1")
        audit.assert_awaited_once()
        assert audit.await_args.kwargs["action"] == "requirement.version_created"
        assert audit.await_args.kwargs["details"]["new_version"] == 2
        db.flush.assert_awaited_once()

    @pytest.mark.anyio
    async def test_product_applies_draft_as_latest_version(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService
        from app.services.rag.models import IngestionResult, IngestionStatus

        kb_id = uuid.uuid4()
        previous = MagicMock()
        previous.id = uuid.uuid4()
        previous.vector_document_id = "vector-v1"

        draft = MagicMock()
        draft.id = uuid.uuid4()
        draft.knowledge_base_id = kb_id
        draft.collection_name = "kb_orders"
        draft.previous_version_id = previous.id
        draft.filename = "orders.md"
        draft.status = "draft"
        draft.version = 2
        draft.markdown_content = "# Orders\n\n- 海外地址"

        ingestion = MagicMock()
        ingestion.ingest_file = AsyncMock(
            return_value=IngestionResult(
                status=IngestionStatus.DONE,
                document_id="vector-v2",
                chunk_count=2,
            )
        )
        ingestion.remove_document = AsyncMock(return_value=True)

        db = MagicMock()
        db.flush = AsyncMock()

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=draft)),
            patch(
                "app.repositories.rag_document_repo.mark_not_latest",
                new=AsyncMock(return_value=previous),
            ) as mark_old,
            patch(
                "app.services.requirement_workflow.record_audit",
                new=AsyncMock(),
            ) as audit,
        ):
            service = RequirementWorkflowService(db=db, ingestion_service=ingestion)
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
        assert draft.vector_document_id == "vector-v2"
        assert draft.chunk_count == 2
        mark_old.assert_awaited_once()
        ingestion.ingest_file.assert_awaited_once()
        ingestion.remove_document.assert_awaited_once_with("kb_orders", "vector-v1")
        audit.assert_awaited_once()
        assert audit.await_args.kwargs["action"] == "requirement.draft_applied"
        assert audit.await_args.kwargs["details"]["new_version"] == 2
        db.flush.assert_awaited_once()

    @pytest.mark.anyio
    async def test_product_rejects_draft_keeps_latest_version(self):
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
        draft.markdown_content = "# Orders\n\n- 草稿变更"

        db = MagicMock()
        db.flush = AsyncMock()

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=draft)),
            patch(
                "app.services.requirement_workflow.record_audit",
                new=AsyncMock(),
            ) as audit,
        ):
            service = RequirementWorkflowService(db=db)
            result = await service.reject_draft(
                kb_id=kb_id,
                draft_doc_id=draft.id,
                user_id=uuid.uuid4(),
                role="product",
                is_app_admin=False,
                reason="验收规则不完整",
            )

        assert result.action == "draft_rejected"
        assert result.document_id == str(draft.id)
        assert result.previous_document_id == str(previous_id)
        assert draft.status == "rejected"
        assert draft.is_latest is False
        assert draft.error_message == "验收规则不完整"
        audit.assert_awaited_once()
        assert audit.await_args.kwargs["action"] == "requirement.draft_rejected"
        assert audit.await_args.kwargs["details"]["reason"] == "验收规则不完整"
        db.flush.assert_awaited_once()

    @pytest.mark.anyio
    async def test_list_requirement_audit_logs_filters_current_kb(self):
        import uuid
        from datetime import UTC, datetime

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        org_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        current = MagicMock()
        current.id = uuid.uuid4()
        current.action = "requirement.rollback"
        current.actor_user_id = actor_id
        current.organization_id = org_id
        current.target_type = "rag_document"
        current.target_id = str(uuid.uuid4())
        current.details = {
            "knowledge_base_id": str(kb_id),
            "from_version": 3,
            "rolled_back_to_version": 1,
            "new_version": 4,
            "reason": "线上验收失败",
        }
        current.created_at = datetime.now(UTC)

        other = MagicMock()
        other.details = {"knowledge_base_id": str(uuid.uuid4())}

        scalars = MagicMock()
        scalars.all.return_value = [current, other]
        execute_result = MagicMock()
        execute_result.scalars.return_value = scalars
        db = MagicMock()
        db.execute = AsyncMock(return_value=execute_result)

        service = RequirementWorkflowService(db=db)
        result = await service.list_requirement_audit_logs(
            kb_id=kb_id,
            organization_id=org_id,
            limit=10,
        )

        assert result.total == 1
        assert result.items[0].action == "requirement.rollback"
        assert result.items[0].details["rolled_back_to_version"] == 1
        assert result.items[0].actor_user_id == str(actor_id)

    @pytest.mark.anyio
    async def test_add_draft_comment_records_audit_event(self):
        import uuid
        from datetime import UTC, datetime

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        user_id = uuid.uuid4()
        org_id = uuid.uuid4()
        draft = MagicMock()
        draft.id = uuid.uuid4()
        draft.knowledge_base_id = kb_id
        draft.organization_id = org_id
        draft.status = "draft"

        entry = MagicMock()
        entry.id = uuid.uuid4()
        entry.created_at = datetime.now(UTC)

        db = MagicMock()
        db.flush = AsyncMock()

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=draft)),
            patch(
                "app.services.requirement_workflow.record_audit",
                new=AsyncMock(return_value=entry),
            ) as audit,
        ):
            service = RequirementWorkflowService(db=db)
            result = await service.add_draft_comment(
                kb_id=kb_id,
                draft_doc_id=draft.id,
                user_id=user_id,
                role="tester",
                body="请补充异常国家的验收标准。",
            )

        assert result.document_id == str(draft.id)
        assert result.author_user_id == str(user_id)
        assert result.role == "tester"
        assert result.body == "请补充异常国家的验收标准。"
        audit.assert_awaited_once()
        assert audit.await_args.kwargs["action"] == "requirement.draft_commented"
        assert audit.await_args.kwargs["details"]["knowledge_base_id"] == str(kb_id)
        assert audit.await_args.kwargs["details"]["body"] == "请补充异常国家的验收标准。"
        db.flush.assert_awaited_once()

    @pytest.mark.anyio
    async def test_list_draft_comments_reads_audit_stream(self):
        import uuid
        from datetime import UTC, datetime

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        draft_id = uuid.uuid4()
        actor_id = uuid.uuid4()

        draft = MagicMock()
        draft.id = draft_id
        draft.knowledge_base_id = kb_id

        current = MagicMock()
        current.id = uuid.uuid4()
        current.actor_user_id = actor_id
        current.details = {
            "knowledge_base_id": str(kb_id),
            "document_id": str(draft_id),
            "role": "developer",
            "body": "这里需要一个更明确的接口错误码。",
        }
        current.created_at = datetime.now(UTC)

        other = MagicMock()
        other.details = {
            "knowledge_base_id": str(uuid.uuid4()),
            "document_id": str(draft_id),
            "body": "other kb",
        }

        scalars = MagicMock()
        scalars.all.return_value = [current, other]
        execute_result = MagicMock()
        execute_result.scalars.return_value = scalars
        db = MagicMock()
        db.execute = AsyncMock(return_value=execute_result)

        with patch(
            "app.repositories.rag_document_repo.get_by_id",
            new=AsyncMock(return_value=draft),
        ):
            service = RequirementWorkflowService(db=db)
            result = await service.list_draft_comments(
                kb_id=kb_id,
                draft_doc_id=draft_id,
                organization_id=uuid.uuid4(),
                limit=10,
            )

        assert result.total == 1
        assert result.items[0].role == "developer"
        assert result.items[0].body == "这里需要一个更明确的接口错误码。"
        assert result.items[0].author_user_id == str(actor_id)

    @pytest.mark.anyio
    async def test_list_pending_drafts_returns_review_queue(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService

        kb_id = uuid.uuid4()
        first = MagicMock()
        first.id = uuid.uuid4()
        first.filename = "orders.md"
        first.version = 2
        first.status = "draft"
        first.is_latest = False
        first.previous_version_id = uuid.uuid4()
        first.modified_by = uuid.uuid4()
        first.markdown_content = "# Orders\n\n- draft"
        first.error_message = "等待产品确认"
        first.created_at = None
        first.completed_at = None

        second = MagicMock()
        second.id = uuid.uuid4()
        second.filename = "address.md"
        second.version = 3
        second.status = "draft"
        second.is_latest = False
        second.previous_version_id = uuid.uuid4()
        second.modified_by = None
        second.markdown_content = "# Address"
        second.error_message = None
        second.created_at = None
        second.completed_at = None

        with patch(
            "app.repositories.rag_document_repo.get_pending_drafts_for_kb",
            new=AsyncMock(return_value=[first, second]),
        ) as list_drafts:
            service = RequirementWorkflowService(db=MagicMock())
            result = await service.list_pending_drafts(kb_id=kb_id)

        assert result.total == 2
        assert result.items[0].status == "draft"
        assert result.items[0].review_note == "等待产品确认"
        assert result.items[1].filename == "address.md"
        list_drafts.assert_awaited_once()

    @pytest.mark.anyio
    async def test_product_rolls_back_to_historical_version(self):
        import uuid

        from app.services.requirement_workflow import RequirementWorkflowService
        from app.services.rag.models import IngestionResult, IngestionStatus

        kb_id = uuid.uuid4()
        actor_id = uuid.uuid4()
        org_id = uuid.uuid4()

        old_doc = MagicMock()
        old_doc.id = uuid.uuid4()
        old_doc.knowledge_base_id = kb_id
        old_doc.collection_name = "kb_orders"
        old_doc.filename = "orders.md"
        old_doc.filetype = "md"
        old_doc.storage_path = ""
        old_doc.markdown_content = "# Orders\n\n- 旧版规则"
        old_doc.version = 1
        old_doc.chunk_count = 1
        old_doc.organization_id = org_id
        old_doc.vector_document_id = "vector-v1"
        old_doc.status = "done"
        old_doc.is_latest = False

        latest_doc = MagicMock()
        latest_doc.id = uuid.uuid4()
        latest_doc.knowledge_base_id = kb_id
        latest_doc.collection_name = "kb_orders"
        latest_doc.filename = "orders.md"
        latest_doc.markdown_content = "# Orders\n\n- 新版规则"
        latest_doc.version = 3
        latest_doc.organization_id = org_id
        latest_doc.vector_document_id = "vector-v3"
        latest_doc.status = "done"
        latest_doc.is_latest = True

        rollback_doc = MagicMock()
        rollback_doc.id = uuid.uuid4()
        rollback_doc.knowledge_base_id = kb_id
        rollback_doc.collection_name = "kb_orders"
        rollback_doc.filename = "orders.md"
        rollback_doc.version = 4
        rollback_doc.markdown_content = old_doc.markdown_content
        rollback_doc.status = "done"

        ingestion = MagicMock()
        ingestion.ingest_file = AsyncMock(
            return_value=IngestionResult(
                status=IngestionStatus.DONE,
                document_id="vector-v4",
                chunk_count=2,
            )
        )
        ingestion.remove_document = AsyncMock(return_value=True)

        db = MagicMock()
        db.flush = AsyncMock()

        with (
            patch("app.repositories.rag_document_repo.get_by_id", new=AsyncMock(return_value=old_doc)),
            patch(
                "app.repositories.rag_document_repo.get_version_chain_for_document",
                new=AsyncMock(return_value=[latest_doc, old_doc]),
            ),
            patch(
                "app.repositories.rag_document_repo.mark_not_latest",
                new=AsyncMock(return_value=latest_doc),
            ) as mark_old,
            patch(
                "app.repositories.rag_document_repo.create",
                new=AsyncMock(return_value=rollback_doc),
            ) as create_doc,
            patch(
                "app.services.requirement_workflow.record_audit",
                new=AsyncMock(),
            ) as audit,
        ):
            service = RequirementWorkflowService(db=db, ingestion_service=ingestion)
            result = await service.rollback_document(
                kb_id=kb_id,
                target_doc_id=old_doc.id,
                user_id=actor_id,
                role="product",
                is_app_admin=False,
                reason="线上验收失败",
            )

        assert result.action == "version_rolled_back"
        assert result.document_id == str(rollback_doc.id)
        assert result.previous_document_id == str(latest_doc.id)
        assert rollback_doc.error_message == "回滚自 v1: 线上验收失败"
        assert rollback_doc.vector_document_id == "vector-v4"
        assert rollback_doc.chunk_count == 2
        mark_old.assert_awaited_once_with(db, latest_doc.id)
        create_doc.assert_awaited_once()
        ingestion.ingest_file.assert_awaited_once()
        ingestion.remove_document.assert_awaited_once_with("kb_orders", "vector-v3")
        audit.assert_awaited_once()
        audit_kwargs = audit.await_args.kwargs
        assert audit_kwargs["action"] == "requirement.rollback"
        assert audit_kwargs["actor_user_id"] == actor_id
        assert audit_kwargs["details"]["rolled_back_to_version"] == 1
        assert audit_kwargs["details"]["new_version"] == 4
        assert result.notification_event is not None
        assert result.notification_event.event_type == "requirement.version_rolled_back"
        db.flush.assert_awaited()

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
            "app.services.requirement_notification.agent_connection_manager.broadcast_event",
            new=AsyncMock(return_value=1),
        ) as broadcast:
            await _broadcast_requirement_event(response)

        broadcast.assert_awaited_once_with("requirement_notification", event.model_dump())

    @pytest.mark.anyio
    async def test_requirement_notification_persists_actor_read_receipt(self):
        import uuid

        from app.schemas.rag import RequirementNotificationEvent
        from app.services.requirement_notification import (
            REQUIREMENT_NOTIFICATION_CREATED,
            REQUIREMENT_NOTIFICATION_READ,
            persist_requirement_notification,
        )

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
        entry = MagicMock()
        entry.id = uuid.uuid4()

        empty_scalars = MagicMock()
        empty_scalars.all.return_value = []
        db = MagicMock()
        db.execute = AsyncMock(
            return_value=MagicMock(scalars=MagicMock(return_value=empty_scalars))
        )

        with patch(
            "app.services.requirement_notification.record_audit",
            new=AsyncMock(side_effect=[entry, MagicMock()]),
        ) as audit:
            result = await persist_requirement_notification(
                db,
                event=event,
                actor_user_id=uuid.uuid4(),
                organization_id=uuid.uuid4(),
            )

        assert result == entry
        assert audit.await_count == 2
        assert audit.await_args_list[0].kwargs["action"] == REQUIREMENT_NOTIFICATION_CREATED
        assert audit.await_args_list[0].kwargs["details"]["event_type"] == "requirement.version_created"
        assert audit.await_args_list[1].kwargs["action"] == REQUIREMENT_NOTIFICATION_READ
        assert audit.await_args_list[1].kwargs["details"]["notification_id"] == str(entry.id)

    @pytest.mark.anyio
    async def test_list_requirement_notifications_merges_read_state(self):
        import uuid
        from datetime import UTC, datetime

        from app.services.requirement_notification import list_requirement_notifications

        kb_id = uuid.uuid4()
        user_id = uuid.uuid4()
        org_id = uuid.uuid4()
        notification_id = uuid.uuid4()

        read_entry = MagicMock()
        read_entry.details = {"notification_id": str(notification_id)}
        read_entry.created_at = datetime.now(UTC)

        notification = MagicMock()
        notification.id = notification_id
        notification.actor_user_id = uuid.uuid4()
        notification.details = {
            "knowledge_base_id": str(kb_id),
            "document_id": str(uuid.uuid4()),
            "event_type": "requirement.draft_applied",
            "filename": "orders.md",
            "message": "orders.md 草稿已应用.",
            "version": 2,
            "status": "done",
            "diff_summary": "应用为 v2.",
        }
        notification.created_at = datetime.now(UTC)

        other = MagicMock()
        other.details = {"knowledge_base_id": str(uuid.uuid4())}

        read_scalars = MagicMock()
        read_scalars.all.return_value = [read_entry]
        notification_scalars = MagicMock()
        notification_scalars.all.return_value = [notification, other]
        db = MagicMock()
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(scalars=MagicMock(return_value=read_scalars)),
                MagicMock(scalars=MagicMock(return_value=notification_scalars)),
            ]
        )

        result = await list_requirement_notifications(
            db,
            kb_id=kb_id,
            user_id=user_id,
            organization_id=org_id,
            limit=10,
        )

        assert result.total == 1
        assert result.unread_count == 0
        assert result.items[0].id == str(notification_id)
        assert result.items[0].read is True
        assert result.items[0].event_type == "requirement.draft_applied"

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
        assert result.structured_changes
        assert result.structured_changes[0].lines[-1].kind == "added"
        assert result.structured_changes[0].lines[-1].content == "- 海外地址"
        assert result.structured_changes[0].lines[-1].new_line_number == 4


{%- else %}
"""Requirement query tests — not configured for this template combination."""
{%- endif %}
