---
type: spec
source: ../prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M6 文档版本管理
priority: P0
depends_on: m0-foundation.md
---

# Spec：M6 文档版本管理

## 功能概述

每次需求文档变更都创建新版本。旧版 `is_latest=false`，新版 `is_latest=true`，并通过 `previous_version_id` 串起版本链。RAG 只索引最新版。

## 版本规则

- 原始上传版本为 `version=1`。
- 新版本 `version = previous.version + 1`。
- 同一版本链只能有一个 `is_latest=true`。
- 旧版本仍可下载源文件、查看 Markdown 和 diff。

## API 契约

```http
GET /api/v1/kb/{kb_id}/documents/{doc_id}/versions
GET /api/v1/kb/{kb_id}/documents/{doc_id}/diff?from=1&to=2
```

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/services/requirement_version.py` | 版本创建、列表、diff |
| `app/repositories/rag_document.py` | 按版本链查询 |
| `app/services/rag/ingestion.py` | 新版索引、旧版向量删除 |
| `app/api/routes/v1/knowledge_bases.py` | 增加版本端点 |

## 当前实现状态

已完成离线 demo 闭环：

- `RAGDocument.version/is_latest/previous_version_id/modified_by` 已落库。
- product/admin 通过 change API 应用修改时，会把旧版标为历史版本并创建新版本。
- 查询 fallback 只读取 `is_latest=true` 且有 `markdown_content` 的 KB 文档。
- 新增版本链 API `GET /api/v1/kb/{kb_id}/documents/{doc_id}/versions`。
- 新增版本对比 API `GET /api/v1/kb/{kb_id}/documents/{doc_id}/diff`，返回 Markdown unified diff。
- 前端历史页可加载版本链、对比最近两版或单个版本与上一版。
- product/admin 直接应用变更或审批草稿后，会重建最新版 Markdown 的向量索引，并删除上一版 `vector_document_id` 对应的向量块；重建失败时保留 SQL Markdown fallback。
- 新增回滚入口 `POST /api/v1/kb/{kb_id}/documents/{doc_id}/rollback`：从选中的历史版本复制出新的最新版本，保留旧最新版为历史版本，重建最新版向量，并写入 `requirement.rollback` 审计日志。
- 新增审计查询入口 `GET /api/v1/kb/{kb_id}/audit-logs`，工作台历史面板可查看当前 KB 的需求版本审计记录。

待实现增强：

- 更完整的回滚对比视图。

## 验收标准

1. 修改后旧版保留且 `is_latest=false`。
2. 新版 `previous_version_id` 指向旧版。
3. RAG 查询只命中最新版。
4. 能查询“这个需求和上次比改了什么”。
