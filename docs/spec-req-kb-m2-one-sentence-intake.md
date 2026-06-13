---
type: spec
source: req-kb-prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M2 一句话需求创建
priority: P0
depends_on:
  - spec-req-kb-m0-foundation.md
  - spec-req-kb-m1-document-ingestion.md
---

# Spec：M2 一句话需求创建

## 功能概述

产品在工作台中输入一句话需求时，AI 主动追问澄清问题；澄清回答提交后生成结构化 Markdown 新版本，并可被 RAG/Markdown fallback 检索。

## 状态机

```text
drafting
  -> clarifying
  -> awaiting_confirmation
  -> ingested
```

## AI 行为

- 首轮识别一句话需求，生成可讨论 Markdown 草案并入库为当前 MVP 文档。
- 追问 2-3 个最关键问题。
- 用户回答后由 AI 更新完整 Markdown，保留原始表达和澄清结论。
- 模型不可用时保留 deterministic fallback，保证本地 demo 和测试可运行。
- 系统 prompt 固化在 `RequirementAIService`，要求反幻觉、角色边界和 JSON-only 结构化输出。

## API 契约

可先走 Agent WebSocket 事件，不额外暴露 HTTP：

```json
{
  "type": "requirement_draft",
  "payload": {
    "title": "海外收货地址支持",
    "markdown": "...",
    "questions": []
  }
}
```

确认入库：

```json
{
  "type": "requirement_confirm",
  "payload": {"draft_id": "..."}
}
```

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/agents/prompts.py` | 增加需求澄清 prompt |
| `app/services/agent_session.py` | 处理 draft/confirm 事件 |
| `app/services/requirement_intake.py` | 新增一句话需求服务 |
| `app/repositories/rag_document.py` | 支持 draft 创建与确认 |

## 当前实现状态

已完成 AI-first MVP 闭环：

- 新增 `POST /api/v1/knowledge-bases/{kb_id}/requirements/from-text`。
- product 可用一句话创建 Markdown 需求文档，落到 `RAGDocument.markdown_content`。
- 响应返回 2-3 个澄清问题、生成的 Markdown 和轻量通知 payload。
- `app/services/requirement_ai.py` 接入 Anthropic Messages-compatible 接口，读取 `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`/`ANTHROPIC_MODEL`。
- `RequirementWorkflowService` 优先调用 AI 生成草案和应用澄清回答；模型未配置或失败时使用本地 fallback。
- 前端在澄清问题下提供回答输入框，提交后调用 change workflow 生成新版本。

待实现增强：

- 对话式多轮澄清状态机。
- 产品确认后再入库，而不是 MVP 版先创建可追踪文档再用澄清回答生成新版本。
- Agent WebSocket 事件接入。

## 验收标准

1. product 输入一句话后 AI 返回 2-3 个澄清问题。
2. 澄清后生成 Markdown 草稿。
3. 用户确认后文档入库，`status=done`，可检索。
4. developer 输入修改时不直接入库，只记录建议；创建需求和上传入口在前端开发身份下禁用。
