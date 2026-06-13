---
type: spec
source:
  - req-kb-prd.md
created: 2026-06-11
status: draft
scope: 需求知识库系统 — 功能点拆分
---

# Spec：需求知识库系统 — 功能点拆分

> 来源文档：[req-kb-prd.md](req-kb-prd.md)
> 基线骨架：`template/{{cookiecutter.project_slug}}/`

## 0. 文档导航

本文档把 PRD 拆解为 9 个可实施功能模块。每个模块单独成 spec，包含数据模型、API、文件范围、依赖和验收标准。

| 模块 | Spec | 优先级 | 状态 |
|------|------|--------|------|
| M0 基础模型与权限底座 | [spec-req-kb-m0-foundation.md](spec-req-kb-m0-foundation.md) | P0 | in_progress |
| M1 文档上传与 Markdown 入库 | [spec-req-kb-m1-document-ingestion.md](spec-req-kb-m1-document-ingestion.md) | P0 | draft |
| M2 一句话需求创建 | [spec-req-kb-m2-one-sentence-intake.md](spec-req-kb-m2-one-sentence-intake.md) | P0 | in_progress |
| M3 需求查询与原文引用 | [spec-req-kb-m3-grounded-query.md](spec-req-kb-m3-grounded-query.md) | P0 | draft |
| M4 AI 需求拆解 | [spec-req-kb-m4-breakdown.md](spec-req-kb-m4-breakdown.md) | P0 | in_progress |
| M5 文档修改、diff 与草稿审批 | [spec-req-kb-m5-change-management.md](spec-req-kb-m5-change-management.md) | P0 | in_progress |
| M6 文档版本管理 | [spec-req-kb-m6-versioning.md](spec-req-kb-m6-versioning.md) | P0 | in_progress |
| M7 角色权限与 AI 行为边界 | [spec-req-kb-m7-rbac-ai-boundary.md](spec-req-kb-m7-rbac-ai-boundary.md) | P0 | draft |
| M8 WebSocket 变更通知 | [spec-req-kb-m8-notifications.md](spec-req-kb-m8-notifications.md) | P1 | implemented |
| M9 前端需求工作台与产品/开发 MVP | [spec-req-kb-m9-frontend-workbench.md](spec-req-kb-m9-frontend-workbench.md) | P0 | implemented |

## 1. 依赖顺序

```text
M0 基础模型/权限
  ├─ M1 文档上传入库
  │   ├─ M3 查询引用
  │   ├─ M4 需求拆解
  │   ├─ M5 修改审批
  │   └─ M6 版本管理
  ├─ M2 一句话需求创建
  │   └─ M1 入库管道
  ├─ M7 权限边界
  │   ├─ M1/M2 写入权限
  │   └─ M5 修改权限
  └─ M8 通知
      └─ M5/M6 文档变更事件
```

## 2. 实施原则

- 文档为中心：所有需求最终都落到 `RAGDocument`，保留源文件和完整 `markdown_content`。
- RAG 只负责定位：回答前必须读取完整 markdown，再输出原文引用。
- 版本快照：旧版保留，新版设置 `is_latest=true`，向量索引只保留最新版。
- 权限先于 AI：产品/admin 可写；开发/测试只能查询和提出建议。
- 小步交付：先打通基础模型和上传入库，再叠加 AI 追问、修改审批和通知。

## 3. 当前 demo MVP 范围

当前实现已覆盖可演示后端闭环：

- M0/M1：扩展 `RAGDocument` 文档全文、版本、最新版和修改人字段；DOCX 优先 Mammoth Markdown 入库；上传完成写回 `markdown_content`。
- M2：`POST /api/v1/kb/{kb_id}/requirements/from-text` 支持 AI-first 一句话创建 Markdown 需求并返回澄清问题；模型未配置时使用本地 fallback。
- M3：`POST /api/v1/kb/{kb_id}/query` 支持从完整 `markdown_content` 兜底检索和来源引用，并可调用需求 AI 基于来源组织回答。
- M4：`GET /api/v1/kb/{kb_id}/documents/{doc_id}/breakdown` 按 Markdown 章节拆解并引用来源。
- M5/M6：`POST /api/v1/kb/{kb_id}/documents/{doc_id}/change` 支持建议、草稿和应用新版本；`POST /api/v1/kb/{kb_id}/documents/{doc_id}/apply-draft` 支持产品审批草稿为最新版本；旧版标记 `is_latest=false`。
- M7：MVP 前端用 `X-Requirement-Role` 在产品/开发间切换；产品可写，开发只能读、拆解或提出建议。
- M8：变更和入库响应返回 `notification_event`，后端通过现有 WebSocket manager 广播 `requirement_notification`，前端工作台实时接收同 KB 事件。

当前仍未完成完整生产态：持久化多轮澄清状态机、结构化红绿 diff/拒绝评论流、Redis 跨进程通知、向量旧版清理和生产态登录角色映射。

## 4. 前端 MVP 调整

MVP 阶段前端不做登录鉴权拆分，但提供产品/开发两个身份选择。详见 [M9 前端需求工作台与产品/开发 MVP](spec-req-kb-m9-frontend-workbench.md)。
