# Phase 4 & Phase 5 执行计划

> 2026-06-10 通过 grill-me 会话锁定所有决策

## Spec 文档索引

Phase 4 拆分为以下可独立执行的功能点 spec：

| Spec | 文件 | 执行顺序 | 说明 |
|------|------|---------|------|
| 运营手册编写 | [spec-ops-manual.md](spec-ops-manual.md) | 第 1 步 | 创建手册 .md 文件 |
| Seed KB 命令 | [spec-seed-mobility-kb.md](spec-seed-mobility-kb.md) | 第 2 步（依赖手册文件） | 创建 KB 记录 + ingest 文档 |

Phase 5 为手动验证，无 spec 文档。

---

## Phase 4：RAG 运营知识库

### 完成标准

1. `backend/docs/mobility_ops_manual.md` 写完（6 主题，~3000 字，广度覆盖）
2. `seed_mobility_kb` 命令实现（创建 KB 记录 + ingest 文档到 Milvus）
3. seed 命令执行成功，Milvus 有 `mobility_ops` collection 且有文档
4. CLI 验证通过：`rag-search "暴雨天调运策略" --collection mobility_ops` 能返回相关结果

### 关键决策

| 决策点 | 结论 | 理由 |
|--------|------|------|
| KB 路由方式 | 走正规 KnowledgeBase 流程 | 完整走通产品逻辑，Demo 更真实 |
| 执行方式 | 写 `seed_mobility_kb` 命令 | 可复现，代码留在仓库，面试官能看到 |
| 手册内容策略 | 广度覆盖，6 主题均衡 | 展示"知识库什么都知道"，各种问法都能命中 |
| KB 激活 | seed 只管创建+ingest，不自动激活 | APP scope KB 前端自动可见，Demo 时手动勾选更有叙事感 |
| 端到端验证 | 不含在 Phase 4，留给 Phase 5 | Phase 4 自己闭环到 CLI 验证 |

### 技术链路

```
mobility_ops_manual.md
  ↓ rag-ingest (embedding via GLM/ZhipuAI embedding-3)
  ↓ 写入 Milvus collection "mobility_ops"
  ↓
seed_mobility_kb 命令：
  1. POST /kb → 创建 KnowledgeBase 记录 (scope=APP, collection_name="mobility_ops")
  2. 调用 IngestionService → ingest 文档到 Milvus
  3. 完成，不自动激活到会话
  ↓
前端 Chat Controls → KB 面板 → 勾选激活 → conversation.active_knowledge_base_ids
  ↓
Agent resolve_kb_collections() → search_documents 工具 → RAG 检索
```

### 手册 6 大主题

| # | 主题 | 核心内容要点 |
|---|------|-------------|
| 1 | 车辆调运标准流程 | 堆积等级阈值（50/80/120）、响应时效、调运优先级排序 |
| 2 | 恶劣天气应急预案 | 暴雨/高温/大雪/雾霾各级响应、预调运触发条件 |
| 3 | 站点维护排期 | 日检/周检/月检项目清单、异常报修流程 |
| 4 | 需求预测方法论 | 基线模型 + 天气修正 + 工作日修正、置信度解读 |
| 5 | 关键运营指标定义 | 利用率/可用率/调运成本/投诉率的计算公式和目标值 |
| 6 | 安全事故处理流程 | 事故分级、上报时限、现场处置、后续复盘 |

### 基础设施状态（已确认）

| 组件 | 状态 |
|------|------|
| Milvus | ✅ healthy，localhost:19530 |
| Embedding API | ✅ GLM/ZhipuAI (open.bigmodel.cn)，模型 embedding-3 |
| PostgreSQL | ✅ healthy |
| Milvus collections | 空（待创建） |
| knowledge_bases 表 | 空（待创建） |

### 涉及的新建文件

| 文件 | 说明 |
|------|------|
| `backend/docs/mobility_ops_manual.md` | 运营手册 |
| `backend/app/commands/seed_mobility_kb.py` | seed 命令 |

---

## Phase 5：集成验证（手动）

### 验证范围

7 个 Demo 场景，覆盖全部能力维度：

| # | 场景 | 涉及能力 | 验证要点 |
|---|------|---------|---------|
| 1 | 查某站点当前车辆分布 | NL2SQL + 数据表格 | SQL 正确、PgQueryResult 渲染正常 |
| 2 | 查某区域近期订单趋势 | NL2SQL + ECharts 折线图 | SQL 正确、图表渲染正常 |
| 3 | 查堆积严重的站点并排序 | NL2SQL + 数据表格 | LIMIT 500 保护、排序逻辑正确 |
| 4 | 查天气预报对调运的建议 | NL2SQL + RAG | Agent 同时检索知识库和查询数据 |
| 5 | 可视化各区域需求预测热力图 | NL2SQL + ECharts 热力图 | chart_server 热力图生成正确 |
| 6 | 切换到应急模式重新提问 | Prompt 模板切换 | 模板切换后回答风格变化 |
| 7 | 问运营手册里的流程/阈值 | RAG 知识检索 | search_documents 被调用、引用来源正确 |

### 执行方式

- 全部在前端 Chat UI 手动测试
- 前端地址：http://172.29.237.34:3001
- 每个场景记录：提问内容、Agent 调用了哪些工具、返回结果是否正确

### 前置条件

- Phase 4 全部完成
- 后端服务运行中（已确认端口 8000）
- 前端服务运行中（已确认端口 3001）
- Milvus 中 `mobility_ops` collection 有数据
- 前端 KB 面板中运营知识库已勾选激活
