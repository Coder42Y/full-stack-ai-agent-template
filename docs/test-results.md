# 测试结果：Mobility Demo 自动化验证

> 自动生成于 $(date '+%Y-%m-%d %H:%M:%S')


## T1：代码质量检查（静态）


### ruff check
- ✅ **ruff check**
  > 1 warnings

### ruff format --check
- ❌ **ruff format --check**: Would reformat: alembic/versions/0019_add_prompt_templates.py
Would reformat: app/agents/mcp_client.py
Would reformat: app/db/models/prompt_template.py
Would reformat: app/repositories/prompt_template.py
Would reformat: app/services/agent_invocation.py
Would reformat: app/services/agent_session.py
Would reformat: app/services/prompt_template.py
7 files would be reformatted, 263 files already formatted
  > Would reformat: alembic/versions/0019_add_prompt_templates.py
Would reformat: app/agents/mcp_client.py
Would reformat: app/db/models/prompt_template.py
Would reformat: app/repositories/prompt_template.py
Would reformat: app/services/agent_invocation.py
Would reformat: app/services/agent_session.py
Would reformat: app/services/prompt_template.py
7 files would be reformatted, 263 files already formatted

### py_compile（新增文件）
- ✅ **py_compile app/commands/seed_mobility_kb.py**
- ✅ **py_compile app/commands/seed_prompts.py**
- ✅ **py_compile app/commands/seed_mobility.py**
- ✅ **py_compile app/agents/mcp_servers/pg_query_server.py**
- ✅ **py_compile app/agents/mcp_servers/chart_server.py**
- ✅ **py_compile app/db/models/mobility.py**
- ✅ **py_compile alembic/versions/0021_create_mobility_tables.py**

## T2：模块导入测试

- ✅ **import app.commands.seed_mobility.seed_mobility**
- ✅ **import app.commands.seed_prompts.seed_prompts**
- ✅ **import app.commands.seed_mobility_kb.seed_mobility_kb**
- ✅ **import app.agents.mcp_servers.pg_query_server.mcp**
- ✅ **import app.agents.mcp_servers.chart_server.mcp**
- ✅ **import app.db.models.mobility.Station**
- ✅ **import app.commands.rag.get_rag_services**

## T3：已有单元测试


### pytest（全部）
- ❌ **pytest**: 0
0 failed, 1 errors
  > 0
0 failed, 1 errors
```
ERROR: usage: pytest [options] [file_or_dir] [file_or_dir] [...]
```

## T4：MCP Server 逻辑验证

| # | 场景 | 预期 | 实际 | 结果 |
|---|------|------|------|------|
| 1 | 正常 SELECT | 通过 | 通过 | ✅ ✓ LIMIT 500 追加 |
| 2 | CTE 内层 LIMIT | 通过 | 通过 | ✅ ✓ LIMIT 500 追加 |
| 3 | AS merge 别名 | 通过 | 通过 | ✅ ✓ LIMIT 500 追加 |
| 4 | CTE 名当表引用 | 通过 | 通过 | ✅ ✓ LIMIT 500 追加 |
| 5 | INSERT 拒绝 | 拒绝 | 拒绝 | ✅ INSERT 被拒绝 |
| 6 | DELETE 拒绝 | 拒绝 | 拒绝 | ✅ DELETE 被拒绝 |
| 7 | DROP 拒绝 | 拒绝 | 拒绝 | ✅ DROP 被拒绝 |
| 8 | 非白名单表 | 拒绝 | 拒绝 | ✅ 非白名单表被拒绝 |
| 9 | 多语句分号 | 拒绝 | 拒绝 | ✅ 多语句被拒绝 |
| 10 | 已有 LIMIT | 通过 | 通过 | ✅ （有 LIMIT 但非 500） |
| 11 | UPDATE 拒绝 | 拒绝 | 拒绝 | ✅ UPDATE 被拒绝 |
| 12 | 子查询非白名单 | 拒绝 | 拒绝 | ✅ 子查询非白名单表被拒绝 |

## T5：种子命令注册验证

- ❌ **seed-mobility --help**: /home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/backend/.venv/bin/python: No module named ai_agent_test
  > /home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/backend/.venv/bin/python: No module named ai_agent_test
- ❌ **seed-prompts --help**: /home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/backend/.venv/bin/python: No module named ai_agent_test
  > /home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/backend/.venv/bin/python: No module named ai_agent_test
- ❌ **seed-mobility-kb --help**: /home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/backend/.venv/bin/python: No module named ai_agent_test
  > /home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/backend/.venv/bin/python: No module named ai_agent_test

## T6：数据库连通性与数据验证


### PostgreSQL 连通性 + Mobility 数据量
- ✅ **数据库连通性**
```
 stations | vehicle_distribution | orders | weather | demand_forecast 
----------+----------------------+--------+---------+-----------------
       18 |                  432 |   2010 |     126 |            3024
(1 row)

```

### Prompt 模板状态
- ✅ **Prompt 模板查询**
```
       name        | is_active 
-------------------+-----------
 Chinese Assistant | f
 Default Assistant | f
 分析模式          | t
 巡检模式          | f
 应急模式          | f
(5 rows)

```

### Knowledge Bases 状态
- ✅ **Knowledge Bases 查询**
```
 name | collection_name | scope 
------+-----------------+-------
(0 rows)

```

## T7：Milvus 连通性

- ✅ **Milvus 连通**: OK
  > 现有 collections: （空）

## T8：前端编译检查


### package.json echarts 依赖
- ✅ **echarts 依赖**
  > 已在 package.json 中

### 新增前端文件存在性
- ✅ **src/components/chat/echart-message.tsx 存在**
- ✅ **src/components/chat/pg-query-result.tsx 存在**
- ✅ **src/types/chat.ts 存在**

### TypeScript 编译检查
- ✅ **TypeScript 编译**
  > 无类型错误

## 测试汇总


| 指标 | 值 |
|------|----|
| ✅ 通过 | 见上方详情 |
| ❌ 失败 | 见上方详情 |
| ⏭️ 跳过 | 见上方详情 |
| 测试时间 | 2026-06-10 20:24:33 |
