---
type: spec
source: ../prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M5 文档修改、diff 与草稿审批
priority: P0
depends_on:
  - m0-foundation.md
  - m3-grounded-query.md
  - m6-versioning.md
  - m7-rbac-ai-boundary.md
---

# Spec：M5 文档修改、diff 与草稿审批

## 功能概述

产品/admin 可通过对话修改需求文档。小改动在对话内展示 diff 并确认；大改动生成草稿，进入文档列表审批。

## 改动判定

| 类型 | 判定 | 处理 |
|------|------|------|
| 小改动 | 影响不超过 1 个段落 | 对话内 diff 确认后更新 |
| 大改动 | 新增/删除/重写 1 个及以上章节 | 创建 `status=draft` 草稿，等待审批 |

AI 判定宁可保守：无法判断时走大改动审批。

## API 契约

```http
POST /api/v1/kb/{kb_id}/documents/{doc_id}/changes
POST /api/v1/kb/{kb_id}/documents/{doc_id}/changes/{change_id}/approve
POST /api/v1/kb/{kb_id}/documents/{doc_id}/changes/{change_id}/reject
```

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/services/requirement_change.py` | 变更判定、diff、草稿创建 |
| `app/api/routes/v1/knowledge_bases.py` | 增加变更审批端点 |
| `app/schemas/requirement_change.py` | 新增请求/响应 schema |
| `app/agents/prompts.py` | 修改意图识别和 diff prompt |

## 当前实现状态

已完成离线 demo 闭环：

- 新增 `POST /api/v1/knowledge-bases/{kb_id}/documents/{doc_id}/change`。
- developer/tester 调用时只返回 `suggestion_recorded`，不创建新版本。
- product/admin 可创建 `draft` 版本，或 `apply=true` 时直接创建 `done` 新版本并把旧版标为 `is_latest=false`。
- 新增 `POST /api/v1/kb/{kb_id}/documents/{doc_id}/apply-draft`，产品可把 `status=draft` 的版本审批为最新 `done` 版本。
- 新增 `POST /api/v1/kb/{kb_id}/documents/{doc_id}/reject-draft`，产品可拒绝草稿并记录拒绝原因，草稿状态变为 `rejected`，当前最新版保持不变。
- 新增 `GET /api/v1/kb/{kb_id}/documents/drafts`，产品可在工作台历史页加载待审批草稿列表并批量处理队列中的草稿。
- 新增 `GET/POST /api/v1/kb/{kb_id}/documents/{doc_id}/comments`，产品/开发/测试可在草稿上追加角色标记评论，工作台历史页展示草稿评论流。
- 产品直接应用变更或审批草稿时会重建最新版 Markdown 的 RAG 向量索引，并删除上一版向量块。
- 前端历史页可加载版本链，对草稿版本执行“应用草稿”或“拒绝草稿”，并展示审批说明。
- diff API 除 `diff_lines` 外返回 `structured_changes`，包含 added/removed/context 行、旧/新行号和 hunk 元数据；前端历史页优先渲染结构化红绿 diff。
- 响应返回 diff 摘要、Markdown preview 和轻量通知 payload。

待实现增强：

- 草稿评论流已实现为审计事件驱动的扁平评论列表；后续可增强为线程、解决状态和成员 mention。

## 验收标准

1. product 小改动生成 diff，确认后创建新版。
2. product 大改动生成草稿，审批后创建新版。
3. developer/tester 修改建议不产生文档变更。
4. 所有修改都保留旧版文档。
