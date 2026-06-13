---
type: spec
source: req-kb-prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M4 AI 需求拆解
priority: P0
depends_on: spec-req-kb-m3-grounded-query.md
---

# Spec：M4 AI 需求拆解

## 功能概述

用户要求“拆解某模块需求”时，AI 基于完整文档按章节输出功能点、接口/数据影响、边界条件和测试关注点，每个拆解点都要引用原文。

## 输出结构

```markdown
## 需求拆解：订单模块

### 1. 海外地址支持
- 功能点：...
- 开发关注：...
- 测试关注：...
- 原文依据：[来源：...]
```

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/services/requirement_breakdown.py` | 新增拆解服务 |
| `app/agents/prompts.py` | 增加拆解 prompt |
| `app/agents/tools/rag_tool.py` | 调用完整文档定位 |

## 当前实现状态

已完成离线 demo 闭环：

- 新增 `GET /api/v1/knowledge-bases/{kb_id}/documents/{doc_id}/breakdown`。
- 基于 `RAGDocument.markdown_content` 按 Markdown 标题拆解。
- 每个拆解项返回 `[来源: filename > section]`。
- tester 角色会附加测试关注点提示，仍只基于原文拆解。

待实现增强：

- 接入 Agent tool 层，让对话场景可直接触发同一拆解服务。
- 引入 LLM 对复杂章节做更自然的任务拆分，但保留原文引用约束。

## 验收标准

1. “帮我拆解订单模块需求”能定位相关最新版文档。
2. 输出按章节组织。
3. 每个拆解点至少有一个来源引用。
4. 不存在原文依据时明确标注“不确定”，不能补充虚构需求。
