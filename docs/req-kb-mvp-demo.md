# 需求知识库 MVP Demo

> Branch: `feature/req-kb-prd`

## Demo Scope

This demo path is AI-first for requirement drafting/query wording and keeps a deterministic fallback when the model gateway is unavailable:

- MVP uses demo admin auto-login for session creation, then a frontend product/developer role selector for requirement behavior.
- Frontend requirement workbench is Chinese-first for browser demos.
- Product creates a requirement project.
- Product creates a requirement from one sentence.
- Product answers clarification questions directly in the intake panel and applies the answers as a new requirement version.
- Developer queries the requirement with original-source citations.
- Developer requests section-level breakdowns and submits suggestion-only changes.
- Product applies a versioned requirement change.
- Backend reads `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and `ANTHROPIC_MODEL` for an Anthropic Messages-compatible requirement AI adapter.
- Responses expose `ai_used`, `ai_model`, and `ai_error`; the frontend shows AI 已响应 or 本地兜底.
- Responses include `notification_event` payloads and the backend broadcasts them over the existing WebSocket connection as `requirement_notification`.
- Frontend `/kb` is a requirement-project entry point; `/kb/{id}` is a four-mode workbench: 录入、查询、拆解、变更.

## Generate A Demo Project

```bash
HOME=/tmp/req-kb-home UV_CACHE_DIR=/tmp/uv-cache uv run python -c "from pathlib import Path; import shutil; from fastapi_gen.config import ProjectConfig, DatabaseType, BackgroundTaskType, FrontendType, RAGFeatures, VectorStoreType; from fastapi_gen.generator import generate_project; out=Path('/tmp/req_kb_mvp_demo'); shutil.rmtree(out, ignore_errors=True); config=ProjectConfig(project_name='req_kb_mvp_demo', database=DatabaseType.POSTGRESQL, frontend=FrontendType.NEXTJS, background_tasks=BackgroundTaskType.NONE, enable_redis=False, enable_docker=True, enable_teams=True, enable_websockets=True, rag_features=RAGFeatures(enable_rag=True, vector_store=VectorStoreType.PGVECTOR)); print(generate_project(config, out))"
```

## Re-run Automation

Run the repository verification from a tmux session:

```bash
tmux -S /tmp/req-kb-mvp.tmux new-session -d -s req-kb-mvp-verify "cd /home/KrisAgent/full-stack-ai-agent-template-clean && REQ_KB_MVP_TMUX_SESSION=req-kb-mvp-verify bash scripts/verify_req_kb_mvp.sh"
```

Artifacts:

- Log: `/tmp/req-kb-mvp-verify.log`
- Summary: `/tmp/req-kb-mvp-automation.summary.md`
- Generated PostgreSQL demo: `/tmp/req_kb_mvp_verify_pg/req_kb_mvp_verify_pg`
- Generated SQLite guard: `/tmp/req_kb_mvp_verify_sqlite/req_kb_mvp_verify_sqlite`

The verifier covers `git diff --check`, repo ruff, template contract tests, PostgreSQL/SQLite generated backend compile and ruff, generated PostgreSQL core tests, and frontend BFF route presence.

## Current Live Demo

A live generated frontend/backend preview can be started with one command:

```bash
bash scripts/start_req_kb_preview.sh
```

The script regenerates the latest template under `/home/KrisAgent/tmp/req_kb_preview_live`, resets a preview PostgreSQL database, applies migrations, installs dependencies, starts backend/frontend in tmux, and verifies:

- backend `/api/v1/health`
- frontend `/kb`
- frontend demo-admin BFF `/api/auth/demo-admin`
- frontend KB BFF `/api/kb`

Default preview artifacts:

- Frontend: `http://172.29.237.34:8783/kb`
- Backend health: `http://172.29.237.34:8782/api/v1/health`
- backend tmux session: `req-kb-preview-backend`
- frontend tmux session: `req-kb-preview-frontend`
- backend log: `/tmp/req-kb-preview-backend.log`
- frontend log: `/tmp/req-kb-preview-frontend.log`
- smoke results: `/tmp/req-kb-preview-demo-admin.json`, `/tmp/req-kb-preview-kb.json`
- live HTTP flow result: `/tmp/req-kb-mvp-live-flow.json`
- Chinese browser E2E report: `/tmp/req-kb-cn-e2e-report.json`
- Chinese browser E2E screenshot: `/tmp/req-kb-cn-e2e-success.png`
- Clarification-loop browser E2E report: `/tmp/req-kb-cn-clarification-e2e-report.json`
- Clarification-loop browser E2E screenshot: `/tmp/req-kb-cn-clarification-e2e-success.png`
- Product/developer AI-role browser E2E report: `/tmp/req-kb-ai-role-e2e-report.json`
- Product/developer AI-role browser E2E screenshot: `/tmp/req-kb-ai-role-e2e-success.png`
- Chinese frontend-BFF integration report: `/tmp/req-kb-cn-bff-e2e-report.json`

The latest browser E2E flow opened `/kb`, auto-signed in as demo admin, created a requirement project as product, entered the workbench, created a one-sentence requirement, saw the AI status badge, answered clarification questions, generated a new requirement version, switched to developer, queried clarified content with citations, submitted a suggestion-only change, switched back to product, and applied another versioned change.

## AI Gateway Status

The Req KB AI adapter has been verified with real Anthropic Messages-compatible requests to:

- `POST http://claude.purvar.local/v1/messages`
- primary model: `deepseek-v4-pro[1m]`
- fallback model: `deepseek-v4-flash`
- auth: `ANTHROPIC_AUTH_TOKEN` from the runtime environment

The primary model currently returns:

```json
{"error":{"message":"No available accounts: no available accounts","type":"api_error"},"type":"error"}
```

The fallback model returned a real response through the same gateway. Verification result:

```text
configured= True
selected_model= deepseek-v4-flash
markdown_chars= 807
question_count= 3
```

So the code path is not a health check: it sends `system`, `model`, and `messages` to the model endpoint, falls back from the unavailable primary model, and returns an AI-generated Markdown draft plus clarification questions.

## Core API Flow

Use the generated backend after installing dependencies, configuring PostgreSQL, and running migrations.

1. Register/login a product user and create a KB.
2. Create a requirement from text:

```http
POST /api/v1/kb/{kb_id}/requirements/from-text
Authorization: Bearer <product-token>
X-Requirement-Role: product

{
  "description": "用户收货地址要支持海外地址",
  "title": "海外收货地址支持",
  "filename": "overseas-address.md"
}
```

3. Query with grounded citations:

```http
POST /api/v1/kb/{kb_id}/query
Authorization: Bearer <developer-token>
X-Requirement-Role: developer

{
  "query": "海外地址支持哪些规则?"
}
```

4. Break down a requirement document:

```http
GET /api/v1/kb/{kb_id}/documents/{doc_id}/breakdown
Authorization: Bearer <tester-token>
X-Requirement-Role: developer
```

5. Developer suggestion, without changing the document:

```http
POST /api/v1/kb/{kb_id}/documents/{doc_id}/change
Authorization: Bearer <developer-token>
X-Requirement-Role: developer

{
  "instruction": "建议补充海外地址的国家列表和运费规则",
  "apply": true
}
```

6. Product applies a new version:

```http
POST /api/v1/kb/{kb_id}/documents/{doc_id}/change
Authorization: Bearer <product-token>
X-Requirement-Role: product

{
  "instruction": "补充海外地址的国家列表和运费规则",
  "apply": true
}
```

## Verification Artifacts

- Re-runnable automation: `scripts/verify_req_kb_mvp.sh`
- Latest tmux verification log: `/tmp/req-kb-mvp-verify.log`
- Latest summary: `/tmp/req-kb-mvp-automation.summary.md`
- Generated PG backend demo used by verification: `/tmp/req_kb_mvp_verify_pg/req_kb_mvp_verify_pg`
- Generated SQLite guard demo used by verification: `/tmp/req_kb_mvp_verify_sqlite/req_kb_mvp_verify_sqlite`
- Live HTTP flow result: `/tmp/req-kb-mvp-live-flow.json`
- Chinese browser E2E report: `/tmp/req-kb-cn-e2e-report.json`
- Chinese browser E2E screenshot: `/tmp/req-kb-cn-e2e-success.png`
- Clarification-loop browser E2E report: `/tmp/req-kb-cn-clarification-e2e-report.json`
- Clarification-loop browser E2E screenshot: `/tmp/req-kb-cn-clarification-e2e-success.png`
- Product/developer AI-role browser E2E report: `/tmp/req-kb-ai-role-e2e-report.json`
- Product/developer AI-role browser E2E screenshot: `/tmp/req-kb-ai-role-e2e-success.png`
- Chinese frontend-BFF integration report: `/tmp/req-kb-cn-bff-e2e-report.json`

## Current Limits

- The automated verifier runs generated-project core tests, not the full generated-project pytest suite.
- WebSocket fan-out is wired to the existing agent socket for the demo; Redis/pubsub cross-process fan-out and read receipts remain production follow-up.
- Persistent multi-turn clarification state and production diff approval UI are still follow-up work.
- The configured primary model currently returns 503 because no upstream accounts are available; the requirement AI automatically falls back to `deepseek-v4-flash`.
