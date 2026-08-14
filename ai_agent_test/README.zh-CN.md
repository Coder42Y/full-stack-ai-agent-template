> **[English](README.md)** · **中文**

# WorkMate — 企业员工 AI 助手

> 面向企业员工的 AI 助手 Demo：用一句中文问题查报销、看请假、问制度，答案带 SQL 依据和文档引用。

**WorkMate** 把一个真实的企业业务场景端到端跑通：员工不用再翻制度文档、找 HR 或开多个系统——直接问助手「我最近三个月的报销是多少」「年假怎么算」，Agent 会通过只读 MCP SQL 工具查询业务表、检索制度知识库，并给出可溯源、带图表的答案。

---

## 为什么 WorkMate？

市面上的 AI 聊天 Demo 大多是「通用问答壳」，而面试/演示最怕的是**没有真实业务闭环**。WorkMate 从开源全栈模板改造而来，把默认的「通用 AI SaaS」替换成企业员工场景：

- **数据是真的**：预置员工、报销、请假三张业务表（`employees` / `reimbursements` / `leaves`），Agent 查询的是 PostgreSQL 里的真实样例数据。
- **答案可溯源**：数据类问题展示 SQL 依据和查询结果表格，制度类问题标注来源文档与具体条款——不是凭空回答。
- **安全且克制**：MCP SQL 工具只读（SELECT/WITH）、白名单表、自动追加行数上限；向量检索用本地 `bge-small-zh-v1.5`，全程无外部 Embedding API。
- **开箱即演示**：一键启动脚本 + 预置 admin 账号 + 中文界面，几分钟就能向面试官跑完整闭环。

> 技术选型本身也值得讲：DeepSeek（OpenAI 兼容）+ pgvector + PydanticAI + ECharts，都是面试官熟悉的主流组件。

## Features

- **报销查询** — 查记录、查总额、按部门/时间/状态聚合，SQL 依据可展开
- **请假与年假** — 请假记录、剩余年假计算，制度口径进 Prompt
- **制度问答** — 员工手册、报销制度等入库 pgvector，答案带来源文档引用
- **图表渲染** — SQL 结果直接渲染成 ECharts 图表，趋势/对比一目了然
- **DeepSeek 余额卡片** — 工作台实时展示真实剩余额度
- **中英双语** — next-intl，中文为默认语言，可一键切换英文

## Quickstart

一条命令起全栈（macOS / Linux）：

```bash
./run.sh          # Docker 模式（默认，首次会 build，较慢）
./run.sh --local  # 本地模式（绕过 Docker，自动装 postgres/redis，推荐本机开发）
```

> 若在 Docker 环境遇到网络问题（如 Docker Desktop gvisor 下出站下载卡死），用 `--local` 模式即可。

启动完成后：

- 前端：<http://localhost:3000>
- 后端 API：<http://localhost:8000> · 文档 <http://localhost:8000/docs>
- 登录：`admin@example.com` / `admin123`

**演示路径**：登录 → 进入「智能分析」→ 直接提问：

```
我最近三个月的报销记录和总额是多少？
我今年的请假记录和剩余年假是多少？
各部门本月的报销分布是怎样的？请用图表展示。
年假怎么算？可以累积到明年吗？
```

## Usage

### 一键脚本

```bash
./run.sh                # setup + start（幂等）
./run.sh --local        # 本地模式
./run.sh status         # 查看端口 / 健康状态
./run.sh logs backend   # 看后端日志
./run.sh stop           # 停止前后端
./run.sh seed           # 重建 admin 账号
NO_CHINA_MIRROR=1 ./run.sh --local   # 国外环境，用官方源
```

### CLI

后端自带 Click CLI（`cd backend && uv run ai_agent_test …`）：

```bash
ai_agent_test user create --email demo@example.com --password xxx   # 建号
ai_agent_test rag-ingest path/to/doc.pdf -c enterprise_ops          # 制度文档入库
ai_agent_test rag-search "年假怎么算" -c enterprise_ops            # 知识库检索
ai_agent_test rag-collections                                      # 查看集合
```

### 手动启动（开发）

```bash
# 后端
cd backend && uv run uvicorn app.main:app --reload --port 8000
# 前端
cd frontend && bun install && bun dev        # http://localhost:3000
```

## 架构

| 组件 | 技术 |
|---|---|
| 后端 | FastAPI + Pydantic v2 |
| 数据库 | PostgreSQL 16 + **pgvector**（向量检索） |
| LLM | **DeepSeek** `deepseek-v4-flash`（OpenAI 兼容 `/v1`） |
| Embedding | `bge-small-zh-v1.5`（本地，512 维） |
| Agent | PydanticAI + MCP 工具（只读 SQL / 知识库 / ECharts） |
| 前端 | Next.js 15 + React 19 + Tailwind v4 |
| i18n | next-intl（`zh` 默认 / `en`） |
| 任务/缓存 | Celery（可选）/ Redis |

### 数据流

```
员工提问 ──> PydanticAI Agent ──> MCP 工具
                    │                  ├─ 只读 SQL（pg_query）→ PostgreSQL 业务表
                    │                  ├─ 知识库检索（RAG）→ pgvector 制度文档
                    │                  └─ ECharts → 图表数据
                    └──> 答案（带 SQL 依据 / 文档引用）回到前端
```

### 目录

```
backend/app/
├── main.py            # FastAPI app + lifespan
├── api/routes/v1/     # HTTP 端点（routes → services → repos）
├── services/          # 业务逻辑（含 rag/、billing/）
├── agents/            # PydanticAI 封装 + MCP 工具（pg_query_server 等）
├── db/models/         # SQLAlchemy（users / conversations / enterprise 等）
├── commands/          # CLI（seed_enterprise / seed_enterprise_kb / seed_prompts …）
└── alembic/           # 数据库迁移

frontend/src/
├── app/[locale]/      # next-intl 路由（营销页 + dashboard）
├── components/        # chat / dashboard / billing / admin / teams …
├── messages/          # zh.json / en.json（i18n）
└── lib/               # api-client / constants / seo
```

## Configuration

后端配置在 `backend/.env`（首次 `run.sh` 自动从 `.env.example` 生成）。关键变量：

```bash
# DeepSeek（run.sh 自动从 ~/.cc-profiles/ds 或环境变量读取 key）
OPENAI_API_KEY=sk-…
OPENAI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-v4-flash

# PostgreSQL（local 模式用本机信任认证）
POSTGRES_HOST=localhost
POSTGRES_DB=ai_agent_test

# RAG / Embedding
EMBEDDING_PROVIDER=sentence-transformers
EMBEDDING_MODEL=BAAI/bge-small-zh-v1.5

# MCP
MCP_ENABLED=true
```

`.env` 已被 gitignore，切勿提交真实密钥。

## Development

```bash
# 后端
cd backend
uv run pytest                                   # 测试
uv run ruff check . --fix && uv run ruff format .  # lint + format
uv run alembic upgrade head                     # 迁移
uv run alembic revision --autogenerate -m "msg" # 新迁移

# 前端
cd frontend
bun run lint        # eslint
bun run build       # 生产构建
bun run test        # vitest
```

## Deployment

- **Docker**：`./run.sh`（默认模式）。服务器上 `pgvector` 用 `pgvector/pgvector:pg16` 镜像或裸机编译，bge 模型用 CPU 即可。
- **本地**：`./run.sh --local`。
- 生产服务器一键部署脚本（`deploy.sh`）规划中，可基于 `run.sh` 的 docker/local 结构扩展。

## Contributing

欢迎提交 Issue / PR。提 PR 前请确保：后端 `ruff` 通过、前端 `bun run lint && bun run build` 通过；i18n 文案改动需同步 `messages/zh.json` 与 `messages/en.json`。

## License

派生自 [Full-Stack AI Agent Template](https://github.com/vstorm-co/full-stack-ai-agent-template)（MIT）。本目录未附带独立 LICENSE 文件，使用请遵循上游许可。
