---
type: spec
source: ../prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M3 需求查询与原文引用
priority: P0
depends_on:
  - m0-foundation.md
  - m1-document-ingestion.md
---

# Spec：M3 需求查询与原文引用

## 功能概述

开发/测试/产品/admin 查询需求时，AI 先通过 RAG chunk 定位候选文档，再读取完整 `markdown_content` 精确定位章节，回答必须引用原文来源。

## 检索链路

```text
query
  -> retrieve chunks
  -> collect parent_doc_id
  -> load latest RAGDocument.markdown_content
  -> locate section
  -> answer with quotes and source labels
```

## 输出规范

必须包含来源标注：

```text
[来源：V2.3_订单模块需求.docx > 用户收货地址 > 海外地址]
```

如果无法精确定位：

```text
未找到可精确引用的原文，可能相关文档：...
```

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/services/requirement_query.py` | 新增完整文档定位服务 |
| `app/services/rag/retrieval.py` | 复用并补充 `parent_doc_id` 约束 |
| `app/agents/tools/rag_tool.py` | 输出来源和模糊提示 |
| `app/agents/prompts.py` | 强制引用原文系统提示 |

## 当前实现状态

已完成 MVP 查询 API：

- 新增 `RequirementQueryService`，先用 RAG chunk 定位 `parent_doc_id`，再按 `vector_document_id` 回查最新 `RAGDocument.markdown_content`。
- 新增 `POST /api/v1/kb/{kb_id}/query`，返回 `RequirementQueryResponse`，包含 `answer/sources/is_grounded`。
- 命中完整 Markdown 时，回答中包含 `[来源：filename > page N > chunk M]`。
- 未找到完整 Markdown 时，返回 chunk 级 fallback，并提示来源不够精确。
- 如果向量检索不可用或没有 embedding key，查询会退回到 KB 最新 `markdown_content` 的确定性检索，仍返回章节级来源引用，便于离线 demo。
- Agent session 和 RAG tool 层已复用 `RequirementQueryService.query_collections`，对话场景在选中需求项目后也走同一套 grounded query。
- tester 角色查询时返回 `test_focus`，测试关注点只从已命中的原文来源生成，并在没有来源覆盖时要求产品确认。

待实现增强：

- 章节标题级定位（例如 `模块 > 小节 > 条款`），当前 MVP 只定位到 page/chunk。

## 验收标准

1. 查询命中文档时，回答包含明确来源。
2. 回答内容来自 `markdown_content`，不是只依赖 chunk 摘要。
3. 找不到精确原文时返回模糊提示。
4. tester 查询拆解时可额外提示测试关注点，但不能编造需求。
