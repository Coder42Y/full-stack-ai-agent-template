# 测试方案：Mobility Demo 自动化验证

> 2026-06-10 自动生成，在 tmux 会话中执行
> 原则：不改动任何代码文件，只运行命令并记录结果

## 测试环境

- 宿主机 venv：`ai_agent_test/backend/.venv/`（Python 3.12+，包含 pytest、ruff）
- Docker 容器：后端跑的是旧镜像代码（挂载失效），不可用于新功能测试
- Milvus：localhost:19530（healthy）
- PostgreSQL：localhost:15432（healthy）

## 测试矩阵

### T1：代码质量检查（静态）

| 测试项 | 命令 | 预期 |
|--------|------|------|
| ruff check | `ruff check .` | 通过，无 lint 错误 |
| ruff format | `ruff format --check .` | 通过，无格式问题 |
| py_compile（新增文件） | 逐文件编译 | 全部通过 |

检查范围：
- `app/commands/seed_mobility_kb.py`
- `app/commands/seed_prompts.py`
- `app/commands/seed_mobility.py`
- `app/agents/mcp_servers/pg_query_server.py`
- `app/agents/mcp_servers/chart_server.py`
- `app/db/models/mobility.py`
- `alembic/versions/0021_create_mobility_tables.py`

### T2：模块导入测试

逐个 import 所有新增模块，验证依赖链完整。

### T3：单元测试（已有）

运行 `uv run pytest`，检查：
- 已有测试是否仍然通过
- test_migrations 迁移测试状态

### T4：MCP Server 逻辑验证

不启动 MCP 进程，直接 import 并调用内部函数测试：

- `pg_query_server._validate_sql()` — 测试各种 SQL 输入
  - 正常 SELECT → 通过
  - CTE 内层 LIMIT → 外层追加 LIMIT 500
  - AS merge 别名 → 不拦截
  - CTE 名当表名 → 不拦截
  - INSERT/DELETE/DROP → 拒绝
  - 非白名单表 → 拒绝
  - 多语句（分号）→ 拒绝
- `chart_server` — import 验证

### T5：种子命令 dry-run

- `seed-mobility --help` — 验证命令注册
- `seed-prompts --help` — 验证命令注册
- `seed-mobility-kb --help` — 验证命令注册

### T6：数据库连通性

- 连接 PostgreSQL（localhost:15432）
- 查询 mobility 表数据量
- 查询 prompt_templates 表

### T7：Milvus 连通性

- 连接 Milvus（localhost:19530）
- 列出现有 collections

### T8：前端编译检查

- `npm run lint` 或 `bun run lint`（如可用）

## 不包含的测试

以下需要人工执行，不在自动化范围内：
- `seed-mobility-kb` 真实 ingest（需要 Milvus + Embedding API）
- `rag-search` 检索验证
- Phase 5 端到端集成验证
- 前端页面渲染检查
