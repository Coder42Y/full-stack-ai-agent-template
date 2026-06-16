---
type: spec
source: ../prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M1 文档上传与 Markdown 入库
priority: P0
depends_on: m0-foundation.md
---

# Spec：M1 文档上传与 Markdown 入库

## 功能概述

产品/admin 上传 PRD 文件后，系统保留源文件，把 docx/pdf/txt/md 转为完整 Markdown，保存到 `RAGDocument.markdown_content`，并把 chunks 写入向量库。

## 核心流程

```text
upload file
  -> 权限校验 product/admin
  -> 存储源文件
  -> 转换 Markdown
  -> 质量检查
  -> 创建/更新 RAGDocument
  -> chunk + embedding + vector upsert
```

## 转换策略

- `.docx` 优先使用 `mammoth` 转 Markdown。
- mammoth 质量检查失败时，如配置 `LLAMAPARSE_API_KEY`，兜底 LlamaParse。
- `.pdf` 复用现有 PDF parser。
- `.md/.txt` 直接读取。

质量检查最低标准：

- Markdown 非空且长度超过 200 字符。
- 标题数量或段落数量不能明显低于源文件结构。
- 表格转换失败时记录 warning；如果启用 LlamaParse 则兜底。

## API 契约

复用并扩展：

```http
POST /api/v1/kb/{kb_id}/documents
```

响应继续返回 `RAGIngestResponse`，后台任务完成后 `RAGDocument.markdown_content/status/chunk_count` 更新。

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/services/rag/models.py` | 已实现：`Document.to_markdown()` 和 `IngestionResult.markdown_content/chunk_count` |
| `app/services/rag/ingestion.py` | 已实现：ingest 完成后返回完整 Markdown 和 chunk 数 |
| `app/services/rag/documents.py` | 增加 mammoth DOCX Markdown parser |
| `app/services/rag_document.py` | 已实现：上传后保存 markdown 内容 |
| `app/worker/tasks/rag_tasks.py` | 已实现：ingestion 完成时写回 markdown |
| `app/worker/background/rag.py` | 已实现：非队列模式写回 markdown |
| `app/commands/rag.py` | 已实现：CLI ingest 写回 markdown |
| `pyproject.toml` | 增加 `mammoth` 依赖 |

## 当前实现状态

已完成最小闭环：

- RAG parser 解析出的完整文档内容可通过 `Document.to_markdown()` 输出。
- `IngestionResult` 返回 `markdown_content` 和 `chunk_count`。
- API 上传后台任务、Celery/Taskiq/ARQ worker、CLI ingest 都会在完成时写回 `RAGDocument.markdown_content`。
- DOCX 优先使用 mammoth 输出 Markdown，失败或空内容时回退到 python-docx 文本解析。
- `/kb/{kb_id}/documents` 上传入口记录 `modified_by`，并由 M7 写权限依赖限制为 product/admin。

待实现增强：

- mammoth 质量检查与 LlamaParse 兜底。
- 更细粒度的表格转换质量 warning 和人工复核队列。

## 验收标准

1. 上传 docx 后源文件可下载。
2. `rag_documents.markdown_content` 保存完整 Markdown。
3. chunk 入向量库，查询能命中。
4. mammoth 转换异常时文档状态为 `error` 或兜底 LlamaParse。
5. developer/tester 上传返回权限错误。
