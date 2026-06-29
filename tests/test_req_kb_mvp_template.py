"""Contract checks for the requirement KB MVP template output."""

from pathlib import Path

import pytest

from fastapi_gen.config import (
    BackgroundTaskType,
    DatabaseType,
    FrontendType,
    OrmType,
    ProjectConfig,
    RAGFeatures,
    VectorStoreType,
)
from fastapi_gen.generator import generate_project


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def pg_req_kb_project(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Generate the PostgreSQL+teams+RAG combo used by the MVP demo."""
    output_dir = tmp_path_factory.mktemp("req_kb_pg")
    config = ProjectConfig(
        project_name="req_kb_contract_pg",
        database=DatabaseType.POSTGRESQL,
        frontend=FrontendType.NONE,
        python_version="3.11",
        background_tasks=BackgroundTaskType.NONE,
        enable_redis=False,
        enable_docker=True,
        enable_teams=True,
        enable_websockets=True,
        rag_features=RAGFeatures(enable_rag=True, vector_store=VectorStoreType.PGVECTOR),
    )
    return generate_project(config, output_dir)


@pytest.fixture(scope="module")
def sqlite_req_kb_project(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Generate a SQLite RAG combo to ensure PG-only APIs are not leaked."""
    output_dir = tmp_path_factory.mktemp("req_kb_sqlite")
    config = ProjectConfig(
        project_name="req_kb_contract_sqlite",
        database=DatabaseType.SQLITE,
        orm_type=OrmType.SQLMODEL,
        frontend=FrontendType.NONE,
        python_version="3.11",
        background_tasks=BackgroundTaskType.NONE,
        enable_redis=False,
        enable_docker=True,
        enable_teams=True,
        enable_websockets=True,
        rag_features=RAGFeatures(enable_rag=True, vector_store=VectorStoreType.CHROMADB),
    )
    return generate_project(config, output_dir)


@pytest.fixture(scope="module")
def pg_redis_req_kb_project(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Generate the PostgreSQL+Redis combo for cross-process notifications."""
    output_dir = tmp_path_factory.mktemp("req_kb_pg_redis")
    config = ProjectConfig(
        project_name="req_kb_contract_pg_redis",
        database=DatabaseType.POSTGRESQL,
        frontend=FrontendType.NONE,
        python_version="3.11",
        background_tasks=BackgroundTaskType.NONE,
        enable_redis=True,
        enable_docker=True,
        enable_teams=True,
        enable_websockets=True,
        rag_features=RAGFeatures(enable_rag=True, vector_store=VectorStoreType.PGVECTOR),
    )
    return generate_project(config, output_dir)


class TestRequirementKbMvpGeneratedOutput:
    """The generated PostgreSQL app should expose the demo MVP workflow."""

    def test_pg_backend_exposes_requirement_workflow_routes(self, pg_req_kb_project: Path) -> None:
        routes = _read(pg_req_kb_project / "backend/app/api/routes/v1/knowledge_bases.py")

        assert "/{kb_id}/requirements/from-text" in routes
        assert "/{kb_id}/query" in routes
        assert "/{kb_id}/documents/{doc_id}/breakdown" in routes
        assert "/{kb_id}/documents/{doc_id}/change" in routes
        assert "CurrentRequirementDemoWriter" in routes
        assert "RequirementDemoRole" in routes
        assert "RequirementQuerySvc" in routes
        assert "RequirementWorkflowSvc" in routes
        assert "/{kb_id}/documents/drafts" in routes
        assert "/{kb_id}/documents/{doc_id}/clarifications" in routes
        assert "/{kb_id}/documents/{doc_id}/apply-draft" in routes
        assert "/{kb_id}/documents/{doc_id}/rollback" in routes
        assert "/{kb_id}/audit-logs" in routes
        assert "/{kb_id}/documents/{doc_id}/comments" in routes
        assert "/{kb_id}/notifications" in routes
        assert "/{kb_id}/notifications/{notification_id}/read" in routes
        assert "/{kb_id}/notifications/read-all" in routes
        assert "_broadcast_requirement_event" in routes
        assert "persist_requirement_notification" in routes
        assert "publish_requirement_event(response.notification_event)" in routes
        assert "RequirementClarificationRequest" in routes

    def test_pg_backend_persists_markdown_and_version_metadata(
        self, pg_req_kb_project: Path
    ) -> None:
        rag_doc_model = _read(pg_req_kb_project / "backend/app/db/models/rag_document.py")
        rag_doc_repo = _read(pg_req_kb_project / "backend/app/repositories/rag_document.py")

        for field in (
            "markdown_content",
            "version",
            "is_latest",
            "previous_version_id",
            "modified_by",
        ):
            assert field in rag_doc_model

        assert "get_latest_markdown_for_kb" in rag_doc_repo
        assert "mark_not_latest" in rag_doc_repo

    def test_pg_backend_implements_ai_first_demo_services(self, pg_req_kb_project: Path) -> None:
        ai = _read(pg_req_kb_project / "backend/app/services/requirement_ai.py")
        workflow = _read(pg_req_kb_project / "backend/app/services/requirement_workflow.py")
        query = _read(pg_req_kb_project / "backend/app/services/requirement_query.py")
        config = _read(pg_req_kb_project / "backend/app/core/config.py")

        assert "REQUIREMENT_AI_SYSTEM_PROMPT" in ai
        assert "Anthropic Messages-compatible" in ai
        assert "ANTHROPIC_AUTH_TOKEN" in config
        assert "ANTHROPIC_BASE_URL" in config
        assert "REQUIREMENT_AI_ENABLED" in config

        assert "class RequirementWorkflowService" in workflow
        assert "ai_service.create_from_text" in workflow
        assert "ai_service.apply_change" in workflow
        assert "ai_error" in workflow
        assert "ai_used" in workflow
        assert "_markdown_from_description" in workflow
        assert "create_from_text" in workflow
        assert "break_down_document" in workflow
        assert "list_document_versions" in workflow
        assert "list_pending_drafts" in workflow
        assert "diff_document_versions" in workflow
        assert "list_requirement_audit_logs" in workflow
        assert "list_draft_comments" in workflow
        assert "add_draft_comment" in workflow
        assert "apply_draft" in workflow
        assert "rollback_document" in workflow
        assert "record_audit" in workflow
        assert "requirement.draft_commented" in workflow
        assert "requirement.rollback" in workflow
        assert "requirement.draft_applied" in workflow
        assert "requirement.draft_rejected" in workflow
        assert "difflib.unified_diff" in workflow
        assert "draft_created" in workflow
        assert "version_created" in workflow
        assert "draft_applied" in workflow
        assert "version_rolled_back" in workflow
        assert "RequirementNotificationEvent" in workflow

        assert "class RequirementQueryService" in query
        assert "ai_service.answer_query" in query
        assert "retrieval_service=retrieval_service" in _read(
            pg_req_kb_project / "backend/app/api/deps.py"
        )
        rag_documents = _read(pg_req_kb_project / "backend/app/services/rag/documents.py")
        assert "_docx_quality_warnings" in rag_documents
        assert "docx_quality_warnings" in rag_documents
        assert "grounding_status" in _read(pg_req_kb_project / "backend/app/schemas/rag.py")
        assert "confidence" in _read(pg_req_kb_project / "backend/app/schemas/rag.py")
        assert "facts" in _read(pg_req_kb_project / "backend/app/schemas/rag.py")
        assert "follow_up_questions" in _read(pg_req_kb_project / "backend/app/schemas/rag.py")
        assert "test_focus" in _read(pg_req_kb_project / "backend/app/schemas/rag.py")
        assert "_query_variants" in query
        assert "_grounding_status" in query
        assert "_tester_focus_from_sources" in query
        assert "use_reranker=True" in query
        assert "ai_model" in query
        assert "_markdown_fallback" in query
        assert "get_latest_markdown_for_kb" in query
        assert "[来源:" in query

    def test_pg_backend_chat_router_handles_lightweight_and_offline_turns(
        self, pg_req_kb_project: Path
    ) -> None:
        session = _read(pg_req_kb_project / "backend/app/services/agent_session.py")
        prompts = _read(pg_req_kb_project / "backend/app/agents/prompts.py")

        assert "_classify_chat_intent" in session
        assert "_maybe_handle_lightweight_turn" in session
        assert "_send_offline_assistant_response" in session
        assert "_maybe_handle_grounded_query" in session
        assert "RequirementQueryService" in session
        assert "query_collections" in session
        assert "assistant_status" in session
        assert "assistant_offline" in session
        assert "requirement_action" in session
        assert "模型服务暂不可用" in session
        assert "当前输入:" not in session
        assert "不要强行要求业务目标" in prompts

    def test_pg_backend_public_register_defaults_to_product_role(
        self, pg_req_kb_project: Path
    ) -> None:
        auth_routes = _read(pg_req_kb_project / "backend/app/api/routes/v1/auth.py")
        user_service = _read(pg_req_kb_project / "backend/app/services/user.py")
        cli = _read(pg_req_kb_project / "backend/cli/commands.py")
        auth_tests = _read(pg_req_kb_project / "backend/tests/api/test_auth.py")

        assert 'model_copy(update={"role": UserRole.PRODUCT})' in auth_routes
        assert "role=UserRole.ADMIN.value if is_first_user else" not in user_service
        assert "is_app_admin=is_first_user" not in user_service
        assert "requested_role = user_in.role.value" in user_service
        assert "is_admin = requested_role == UserRole.ADMIN.value" in user_service
        assert "is_app_admin=is_admin" in user_service
        assert 'click.Choice(["user", "admin", "product", "developer", "tester"])' in cli
        assert "user.is_app_admin = True" in cli
        assert "test_register_forces_public_product_role" in auth_tests
        assert 'registered_user.role == "product"' in auth_tests

    def test_pg_backend_includes_service_tests(self, pg_req_kb_project: Path) -> None:
        tests = _read(pg_req_kb_project / "backend/tests/test_requirement_query.py")
        rag_schemas = _read(pg_req_kb_project / "backend/app/schemas/rag.py")
        workflow_service = _read(
            pg_req_kb_project / "backend/app/services/requirement_workflow.py"
        )

        assert "test_query_falls_back_to_markdown_without_vector_hits" in tests
        assert "test_create_from_text_persists_markdown_and_questions" in tests
        assert "test_developer_change_records_suggestion_only" in tests
        assert "test_tester_change_records_suggestion_only" in tests
        assert "test_product_apply_change_creates_latest_version" in tests
        assert "test_product_applies_draft_as_latest_version" in tests
        assert "test_tester_query_returns_source_bound_test_focus" in tests
        assert "test_product_rejects_draft_keeps_latest_version" in tests
        assert "test_list_pending_drafts_returns_review_queue" in tests
        assert "test_product_rolls_back_to_historical_version" in tests
        assert "test_list_requirement_audit_logs_filters_current_kb" in tests
        assert "test_add_draft_comment_records_audit_event" in tests
        assert "test_list_draft_comments_reads_audit_stream" in tests
        assert "test_create_from_text_records_clarification_session" in tests
        assert "test_answer_clarifications_records_round_and_updates_requirement" in tests
        assert "ingestion.remove_document.assert_awaited_once_with" in tests
        assert "assert new_doc.vector_document_id == \"vector-v2\"" in tests
        assert "audit.assert_awaited_once" in tests
        assert "test_requirement_notification_helper_broadcasts_payload" in tests
        assert "test_requirement_notification_persists_actor_read_receipt" in tests
        assert "test_list_requirement_notifications_merges_read_state" in tests
        assert "test_diff_document_versions_returns_unified_diff" in tests
        assert "assert result.structured_changes" in tests
        assert "class RequirementDocumentDiffHunk" in rag_schemas
        assert "structured_changes=_structured_diff(diff_lines)" in workflow_service
        assert "RequirementClarificationSession" in rag_schemas
        assert "requirement.clarification_started" in workflow_service
        assert "answer_clarifications" in workflow_service

    def test_pg_redis_backend_wires_requirement_notification_bus(
        self,
        pg_redis_req_kb_project: Path,
    ) -> None:
        notification_service = _read(
            pg_redis_req_kb_project / "backend/app/services/requirement_notification.py"
        )
        main = _read(pg_redis_req_kb_project / "backend/app/main.py")
        routes = _read(
            pg_redis_req_kb_project / "backend/app/api/routes/v1/knowledge_bases.py"
        )

        assert "REQUIREMENT_NOTIFICATION_CHANNEL = \"requirement_notifications\"" in notification_service
        assert "REQUIREMENT_NOTIFICATION_CREATED = \"requirement.notification_created\"" in notification_service
        assert "REQUIREMENT_NOTIFICATION_READ = \"requirement.notification_read\"" in notification_service
        assert "persist_requirement_notification" in notification_service
        assert "list_requirement_notifications" in notification_service
        assert "mark_requirement_notification_read" in notification_service
        assert "mark_all_requirement_notifications_read" in notification_service
        assert "await client.publish(REQUIREMENT_NOTIFICATION_CHANNEL" in notification_service
        assert "async def _listen_requirement_notifications" in notification_service
        assert "start_requirement_notification_listener" in main
        assert "stop_requirement_notification_listener" in main
        assert "publish_requirement_event(response.notification_event)" in routes

    def test_sqlite_combo_does_not_expose_pg_only_workflow_routes(
        self, sqlite_req_kb_project: Path
    ) -> None:
        routes = _read(sqlite_req_kb_project / "backend/app/api/routes/v1/knowledge_bases.py")
        conversation_model = _read(sqlite_req_kb_project / "backend/app/db/models/conversation.py")

        assert "/{kb_id}/requirements/from-text" not in routes
        assert "RequirementWorkflowSvc" not in routes
        assert not (sqlite_req_kb_project / "backend/app/services/requirement_workflow.py").exists()
        assert "from typing import TYPE_CHECKING" in conversation_model
        assert "from app.db.models.chat_file import ChatFile" in conversation_model


class TestRequirementKbMvpFrontendTemplate:
    """Frontend template files should expose BFF routes and hook methods."""

    template_root = Path("template/{{cookiecutter.project_slug}}/frontend/src")

    def test_frontend_bff_routes_are_present(self) -> None:
        route_paths = [
            "app/api/kb/[id]/requirements/from-text/route.ts",
            "app/api/kb/[id]/query/route.ts",
            "app/api/kb/[id]/documents/[docId]/breakdown/route.ts",
            "app/api/kb/[id]/documents/[docId]/clarifications/route.ts",
            "app/api/kb/[id]/documents/drafts/route.ts",
            "app/api/kb/[id]/documents/[docId]/change/route.ts",
            "app/api/kb/[id]/documents/[docId]/apply-draft/route.ts",
            "app/api/kb/[id]/documents/[docId]/reject-draft/route.ts",
            "app/api/kb/[id]/documents/[docId]/rollback/route.ts",
            "app/api/kb/[id]/documents/[docId]/versions/route.ts",
            "app/api/kb/[id]/documents/[docId]/diff/route.ts",
            "app/api/kb/[id]/audit-logs/route.ts",
            "app/api/kb/[id]/documents/[docId]/comments/route.ts",
            "app/api/kb/[id]/notifications/route.ts",
            "app/api/kb/[id]/notifications/[notificationId]/read/route.ts",
            "app/api/kb/[id]/notifications/read-all/route.ts",
        ]

        for route_path in route_paths:
            route = _read(self.template_root / route_path)
            assert "backendFetch" in route
            assert "/api/v1/kb/" in route
            if route_path.endswith(("change/route.ts", "clarifications/route.ts", "breakdown/route.ts", "query/route.ts", "from-text/route.ts")):
                assert "requirementRoleHeaders" in route

    def test_frontend_hooks_and_types_are_present(self) -> None:
        hook = _read(self.template_root / "hooks/use-knowledge-bases.ts")
        types = _read(self.template_root / "types/knowledge-base.ts")
        type_index = _read(self.template_root / "types/index.ts")

        for method in (
            "createRequirementFromText",
            "queryRequirements",
            "breakDownDocument",
            "changeRequirementDocument",
            "applyRequirementDraft",
            "rejectRequirementDraft",
            "rollbackRequirementVersion",
            "fetchDocumentVersions",
            "fetchPendingDrafts",
            "fetchRequirementClarifications",
            "answerRequirementClarifications",
            "fetchRequirementAuditLogs",
            "fetchDraftComments",
            "fetchRequirementNotifications",
            "markRequirementNotificationRead",
            "markAllRequirementNotificationsRead",
            "addDraftComment",
            "diffDocumentVersions",
        ):
            assert method in hook

        assert "X-Requirement-Role" in hook

        for type_name in (
            "RequirementIntakeResponse",
            "RequirementQueryResponse",
            "RequirementBreakdownResponse",
            "RequirementChangeResponse",
            "RequirementClarificationSession",
            "RequirementClarificationResponse",
            "RequirementClarificationInput",
            "RequirementDocumentVersionList",
            "RequirementDocumentDiffResponse",
            "RequirementDocumentDiffHunk",
            "RequirementAuditLogList",
            "RequirementDraftCommentList",
            "RequirementDraftCommentItem",
            "RequirementNotificationEvent",
            "RequirementNotificationList",
            "RequirementNotificationItem",
            "RequirementRole",
        ):
            assert type_name in types

        assert "ai_used" in types
        assert "ai_error" in types
        assert "grounding_status" in types
        assert "confidence" in types
        assert "follow_up_questions" in types
        assert "test_focus" in types
        chat_types = _read(self.template_root / "types/chat.ts")
        use_chat = _read(self.template_root / "hooks/use-chat.ts")
        action_card = _read(
            self.template_root / "components/chat/requirement-action-card.tsx"
        )

        assert "assistant_offline" in chat_types
        assert "requirement_action" in chat_types
        assert "ChatAction" in chat_types
        assert "RequirementActionCard" in chat_types
        assert "intent_hint" in use_chat
        assert "assistant_offline" in use_chat
        assert "requirement_action" in use_chat
        assert "模型服务暂不可用" not in action_card
        assert "离线助手" in action_card
        assert "重试本轮" not in action_card

        assert 'export * from "./knowledge-base";' in type_index

    def test_frontend_workbench_pages_are_present(self) -> None:
        list_page = _read(self.template_root / "app/[locale]/(dashboard)/kb/page.tsx")
        detail_page = _read(self.template_root / "app/[locale]/(dashboard)/kb/[id]/page.tsx")
        project_list = _read(
            self.template_root / "components/requirements/requirement-project-list.tsx"
        )
        workbench = _read(self.template_root / "components/requirements/requirement-workbench.tsx")
        component_index = _read(self.template_root / "components/requirements/index.ts")

        assert "RequirementProjectList" in list_page
        assert "RequirementWorkbench" in detail_page
        assert "需求知识库" in list_page
        assert "新建需求项目" in list_page
        assert "router.push(`/kb/${id}`)" in list_page
        assert "管理 PRD、一句话需求、来源问答、拆解结果和版本变更" in project_list
        assert "需求项目" in project_list
        assert 'type WorkbenchMode = "intake" | "query" | "breakdown" | "change" | "history";' in workbench
        assert "当前身份" in workbench
        assert "产品" in workbench
        assert "开发" in workbench
        assert "测试" in workbench
        assert '"tester"' in workbench
        assert "RoleSelector" in workbench
        assert "AIStatusBadge" in workbench
        assert "AI 已响应" in workbench
        assert "本地兜底" in workbench
        assert 'label: "录入"' in workbench
        assert 'label: "查询"' in workbench
        assert 'label: "拆解"' in workbench
        assert 'label: "变更"' in workbench
        assert 'label: "历史"' in workbench
        assert "用一句话创建需求" in workbench
        assert "查询有来源的需求答案" in workbench
        assert "groundingStatusLabel" in workbench
        assert "已确认信息" in workbench
        assert "谨慎推断" in workbench
        assert "待产品确认" in workbench
        assert "应用版本变更" in workbench
        assert "提交修改建议" in workbench
        assert "查看版本历史与差异" in workbench
        assert "加载版本历史" in workbench
        assert "对比最近两版" in workbench
        assert "StructuredDiffViewer" in workbench
        assert "DiffLineRow" in workbench
        assert "澄清问题与回答" in workbench
        assert "在每个问题下方填写回答" in workbench
        assert "用这些回答更新需求版本" in workbench
        assert "firstClarificationInputRef" in workbench
        assert "onAnswerClarifications" in workbench
        assert "onFetchClarifications" in workbench
        assert "structuredAnswers" in workbench
        assert "澄清回答已应用" in workbench
        assert "持久澄清记录" in workbench
        assert "clarificationStateLabel" in workbench
        assert 'htmlFor="requirement-title"' in workbench
        assert 'id="requirement-description"' in workbench
        assert 'htmlFor="requirement-query"' in workbench
        assert 'htmlFor="requirement-change"' in workbench
        assert "changeActionLabel(result.action)" in workbench
        assert "eventTypeLabel(event.event_type)" in workbench
        assert "已创建新版本" in workbench
        assert "需求已创建" in workbench
        assert "onCreateRequirement" in workbench
        assert "onBreakdown" in workbench
        assert "onChange" in workbench
        assert "onApplyDraft" in workbench
        assert "onRejectDraft" in workbench
        assert "onRollbackVersion" in workbench
        assert "onFetchVersions" in workbench
        assert "onFetchPendingDrafts" in workbench
        assert "onFetchClarifications" in workbench
        assert "answerRequirementClarifications" in detail_page
        assert "fetchRequirementClarifications" in detail_page
        assert "onFetchAuditLogs" in workbench
        assert "onFetchDraftComments" in workbench
        assert "onFetchNotifications" in workbench
        assert "onMarkNotificationRead" in workbench
        assert "onMarkAllNotificationsRead" in workbench
        assert "onAddDraftComment" in workbench
        assert "onDiffVersions" in workbench
        assert "useWebSocket" in workbench
        assert "requirement_notification" in workbench
        assert 'import { toast } from "sonner";' in workbench
        assert "RequirementEventFeedItem" in workbench
        assert "toast.info(event.message" in workbench
        assert 'read: false, source: "remote", showToast: true' in workbench
        assert "通知连接" in workbench
        assert "通知中心" in workbench
        assert "NotificationCenter" in workbench
        assert "notificationItemToFeedItem" in workbench
        assert "持久通知" in workbench
        assert "标记已读" in workbench
        assert "fetchRequirementNotifications" in detail_page
        assert "markRequirementNotificationRead" in detail_page
        assert "markAllRequirementNotificationsRead" in detail_page
        assert "items={result.test_focus}" in workbench
        assert "全部标记已读" in workbench
        assert "未读" in workbench
        assert "已读" in workbench
        assert "应用草稿" in workbench
        assert "草稿已应用" in workbench
        assert "拒绝草稿" in workbench
        assert "草稿已拒绝" in workbench
        assert "待审批草稿" in workbench
        assert "审计日志" in workbench
        assert "AuditLogCard" in workbench
        assert "草稿评论流" in workbench
        assert "DraftCommentList" in workbench
        assert "添加评论" in workbench
        assert "暂无草稿评论" in workbench
        assert "回滚到此版" in workbench
        assert "版本已回滚" in workbench
        assert "审批说明" in workbench
        assert "export { RequirementProjectList }" in component_index
        assert "export { RequirementWorkbench }" in component_index

    def test_frontend_auth_role_login_and_open_registration(self) -> None:
        auth_roles = _read(self.template_root / "lib/auth-roles.ts")
        login_form = _read(self.template_root / "components/auth/login-form.tsx")
        register_form = _read(self.template_root / "components/auth/register-form.tsx")
        login_route = _read(self.template_root / "app/api/auth/login/route.ts")
        register_route = _read(self.template_root / "app/api/auth/register/route.ts")
        auth_types = _read(self.template_root / "types/auth.ts")
        auth_guard = _read(self.template_root / "components/layout/auth-guard.tsx")

        assert 'export type LoginRole = "admin" | "developer" | "tester" | "product";' in auth_roles
        for label in ("Admin", "Developer", "Test", "PM"):
            assert label in auth_roles
        assert "LOGIN_ROLES.map" in login_form
        assert "登录身份" in login_form
        assert "await login({ email, password, role })" in login_form
        assert "isLoginRole(selectedRole)" in login_route
        assert "roleLabel(selectedRole)" in login_route
        assert "user.role !== selectedRole" in login_route
        assert "请选择登录身份" in login_route
        assert "请选择匹配的身份" in login_route
        assert 'role: "product"' in register_route
        assert "用户名" in register_form
        assert 'await register({ email, password, full_name: name })' in register_form
        assert "注册后默认以 PM 身份进入需求工作台" in register_form
        assert 'role: "admin" | "developer" | "tester" | "product";' in auth_types
        assert "full_name: string;" in auth_types
        assert 'NEXT_PUBLIC_AUTO_DEMO_ADMIN !== "true"' in auth_guard
        assert "router.replace(ROUTES.LOGIN)" in auth_guard

    def test_frontend_requirement_feedback_is_chinese(self) -> None:
        hook = _read(self.template_root / "hooks/use-knowledge-bases.ts")

        assert "加载需求项目失败" in hook
        assert "需求项目已创建" in hook
        assert "创建需求项目失败" in hook
        assert "需求已创建" in hook
        assert "创建需求失败" in hook

    def test_frontend_requirement_navigation_is_chinese(self) -> None:
        header = _read(self.template_root / "components/layout/header.tsx")
        sidebar = _read(self.template_root / "components/layout/sidebar.tsx")
        mobile_tab_bar = _read(self.template_root / "components/layout/mobile-tab-bar.tsx")
        command_palette = _read(self.template_root / "components/layout/command-palette.tsx")
        breadcrumb = _read(self.template_root / "components/layout/breadcrumb.tsx")
        constants = _read(self.template_root / "lib/constants.ts")
        seo = _read(self.template_root / "lib/seo.ts")

        assert "需求知识库" in header
        assert "需求知识库" in sidebar
        assert "需求项目" in header
        assert "需求项目" in sidebar
        assert 'label: "需求"' in mobile_tab_bar
        assert 'label="需求项目"' in command_palette
        assert '[ROUTES.KB]: "需求项目"' in breadcrumb
        assert 'PROFILE: "/settings/profile"' in constants
        assert 'name: "需求知识库"' in seo
        assert "需求知识库与 AI 协作工作台" in seo

    def test_frontend_top_level_pages_match_prd_domain(self) -> None:
        dashboard = _read(self.template_root / "app/[locale]/(dashboard)/dashboard/page.tsx")
        chat_empty = _read(self.template_root / "components/chat/chat-empty-state.tsx")
        chat_sidebar = _read(self.template_root / "components/chat/conversation-sidebar.tsx")
        chat_input = _read(self.template_root / "components/chat/chat-input.tsx")
        orgs = _read(self.template_root / "app/[locale]/(dashboard)/orgs/page.tsx")
        profile = _read(self.template_root / "app/[locale]/(dashboard)/settings/profile/page.tsx")
        settings_layout = _read(self.template_root / "app/[locale]/(dashboard)/settings/layout.tsx")
        settings_nav = _read(self.template_root / "components/settings/settings-nav.tsx")
        create_org = _read(self.template_root / "components/teams/create-org-dialog.tsx")
        auth_layout = _read(self.template_root / "app/[locale]/(auth)/layout.tsx")
        og_image = _read(self.template_root / "app/opengraph-image.tsx")

        assert "需求协作指挥台" in dashboard
        assert "今日关注" in dashboard
        assert "产品一句话录入" in dashboard
        assert "开发有来源查询" in dashboard
        assert "这里是需求对话入口" in chat_empty
        assert "澄清一句话需求" in chat_empty
        assert "新建需求对话" in chat_sidebar
        assert "输入需求问题、澄清回答或变更建议" in chat_input
        assert "协作空间" in orgs
        assert "新建协作空间" in create_org
        assert "管理你的演示身份" in settings_layout
        assert "个人资料" in settings_nav
        assert "演示账号" in profile
        assert "业务身份" in profile
        assert "需求知识库 MVP" in auth_layout
        assert "登录后进入需求协作工作台" in auth_layout
        assert "需求&nbsp;" in og_image
        assert "可追溯" in og_image

        forbidden = [
            "Good morning",
            "Good afternoon",
            "Good evening",
            "Here's what's happening",
            "Ready when you are",
            "Summarize my docs",
            "Workspaces and",
            "Personal info",
            "Make it yours",
            "AI assistant for modern teams",
            "Plug in your docs",
            "Ship the AI feature",
            "Replaced four SaaS tools",
            "AI&nbsp;that",
            "your work",
        ]
        combined = "\n".join(
            [
                dashboard,
                chat_empty,
                chat_sidebar,
                chat_input,
                orgs,
                profile,
                settings_layout,
                auth_layout,
                og_image,
            ]
        )
        for phrase in forbidden:
            assert phrase not in combined

    def test_frontend_auto_demo_admin_auth_is_present(self) -> None:
        demo_admin_route = _read(self.template_root / "app/api/auth/demo-admin/route.ts")
        auth_guard = _read(self.template_root / "components/layout/auth-guard.tsx")
        use_chat = _read(self.template_root / "hooks/use-chat.ts")
        chat_container = _read(self.template_root / "components/chat/chat-container.tsx")

        assert "admin-demo@example.com" in demo_admin_route
        assert "DemoAdmin123!" in demo_admin_route
        assert "access_token" in demo_admin_route
        assert "/api/v1/auth/register" not in demo_admin_route
        assert "演示管理员账号不可用" in demo_admin_route
        assert 'apiClient.post<User & { access_token?: string }>("/auth/demo-admin")' in auth_guard
        assert 'NEXT_PUBLIC_AUTO_DEMO_ADMIN !== "true"' in auth_guard
        assert "router.replace(ROUTES.LOGIN)" in auth_guard
        assert "setAccessToken(access_token ?? null)" in auth_guard
        assert "useAuthStore.getState().setAccessToken(null)" in auth_guard
        assert "useState(true)" in auth_guard
        assert "if (isAuthenticated) return" not in auth_guard
        assert "正在建立演示会话" in auth_guard
        assert "const canConnect = Boolean(accessToken)" in use_chat
        assert "canConnect" in chat_container
        assert "if (!canConnect)" in chat_container

    def test_frontend_chat_app_routes_do_not_show_cookie_banner(self) -> None:
        cookie_banner = _read(self.template_root / "components/marketing/cookie-banner.tsx")

        assert "usePathname" in cookie_banner
        assert "APP_ROUTE_RE" in cookie_banner
        assert "dashboard|chat|kb|orgs|settings|admin|rag|profile" in cookie_banner
        assert "setShow(false)" in cookie_banner

    def test_frontend_chat_controls_are_chinese(self) -> None:
        chat_container = _read(self.template_root / "components/chat/chat-container.tsx")
        chat_controls = _read(self.template_root / "components/chat/chat-controls.tsx")

        assert "在线" in chat_container
        assert "离线" in chat_container
        assert "AI 可能出错，请以需求来源和验收标准为准。" in chat_container
        for phrase in (
            "个人",
            "组织",
            "全局",
            "默认模型",
            "知识库",
            "模型",
            "设置",
            "发送后保存",
            "随机性",
            "推理强度",
            "恢复服务端默认",
        ):
            assert phrase in chat_controls

        for phrase in (
            '"Controls"',
            "Settings persist",
            '"Knowledge bases"',
            '"Saves on send"',
            '"Saved for this chat"',
            ">Thinking effort<",
            ">Reset to server default<",
        ):
            assert phrase not in chat_controls
