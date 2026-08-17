# Full-Stack AI Agent Template

> 一条命令生成带 AI Agent、RAG 知识库、团队协作、计费和管理后台的 **FastAPI + Next.js** 全栈应用。

[English](README.en.md) | **中文**

这是一个 **AI 应用生成器**，也是一个**可直接运行的展示项目**：

- **生成器**（`fastapi-fullstack`）：交互式 CLI，从 199 个配置项里挑出你要的组合，生成生产级全栈代码。
- **展示实例**（`ai_agent_test/`）：用这个模板生成的一个完整应用，定制为 **WorkMate · 企业员工 AI 助手**，开箱即跑，适合做 Demo 和面试展示。

---

## ✨ 一图看懂

```
你                          fastapi-fullstack                  生成的项目
┌──────────┐   --database postgresql     ┌────────────────────┐
│ 提问一句 │   --rag --vector-store      │ FastAPI 后端        │
│ "年假怎么算"│ ──────────────────────▶ │  AI Agent + RAG     │
│          │   --frontend nextjs        │  Next.js 前端       │
└──────────┘                            │  PostgreSQL + 向量库 │
                                        │  Stripe / 管理后台   │
                                        └────────────────────┘
```

---

## 🚀 WorkMate · 企业员工 AI 助手（当前展示）

`ai_agent_test/` 是这个模板生成的真实应用，定制为企业内部 AI 助手：员工不用翻制度文档、不用找 HR，直接问一句话就能查报销、看请假、问制度，答案带 **SQL 依据**和**文档引用**。

**核心能力**

| 场景 | 能力 |
|---|---|
| 报销查询 | 查记录 / 查总额 / 按部门·时间·状态聚合，SQL 依据可展开 |
| 请假与年假 | 请假记录、剩余年假计算，制度口径进 Prompt |
| 制度问答 | 员工手册、报销制度等入库向量库，答案带来源引用 |
| 图表渲染 | SQL 结果直接渲染成 ECharts 图表 |
| DeepSeek 余额 | 工作台实时展示 API 账户真实余额 |

**技术栈**：FastAPI · PostgreSQL(pgvector) · 本地 bge 中文 Embedding · PydanticAI · MCP · Next.js 15 · ECharts · DeepSeek

**一键启动（macOS / Linux）**

```bash
cd ai_agent_test
./run.sh --local        # 本地模式：自动装依赖 + 起前后端 + 跑迁移
./run.sh --local status # 查看状态
# 或 Docker 模式：./run.sh
```

- 前端 http://localhost:3000 · 后端 http://localhost:8000 · 文档 http://localhost:8000/docs
- 预置 admin 账号：`admin@example.com / admin123`

详见 [ai_agent_test/README.zh-CN.md](ai_agent_test/README.zh-CN.md)。

---

## 🧩 生成器能力全景

生成器内置 **199 个配置项**，覆盖从「纯后端 API」到「生产级 SaaS」的所有组合。

### 后端

| 领域 | 可选项 |
|---|---|
| 数据库 | PostgreSQL（异步 asyncpg）· MongoDB（异步 motor）· SQLite（同步）· 无 |
| ORM | SQLAlchemy · SQLModel |
| 分层 | FastAPI + Pydantic v2 + Alembic + Service / Repository 架构 |
| 认证 | JWT + refresh token + API key · 本地认证 · OAuth（Google）· Magic Link |

### AI 与 RAG

| 领域 | 可选项 |
|---|---|
| AI 框架 | PydanticAI · LangChain · LangGraph · CrewAI · DeepAgents · 无 |
| LLM 供应商 | OpenAI · Anthropic · Google Gemini · OpenRouter · 全部（运行时切换）|
| 向量库 | Milvus · Qdrant · ChromaDB · pgvector |
| Embedding | OpenAI · Voyage · Gemini · 本地 Sentence-Transformers |
| Reranker | Cohere · 本地 Cross-Encoder |
| PDF 解析 | PyMuPDF（本地）· LlamaParse（云端 AI）· LiteParse（本地 AI）· 全部 |
| RAG 进阶 | 混合检索 · OCR · 图片描述 · Google Drive / S3 同步源 |

### 前端（Next.js 15）

- App Router + Tailwind · 中英双语（next-intl）· 深色/浅色主题
- 页面：登录注册 · 聊天 · 知识库 · 仪表盘 · 管理后台 · 计费 · 营销站

### SaaS 与运维

| 领域 | 可选项 |
|---|---|
| 多租户 | 单租户 · 多组织（团队/邀请）· 平台模式 |
| 计费 | Stripe：订阅 / 按量 / 混合 / 一次性，积分系统 |
| 邮件 | Resend · SMTP · 控制台打印（开发用）|
| 任务队列 | Celery · Taskiq · ARQ |
| 部署 | Docker Compose · 可选 Kubernetes · Nginx / Traefik |
| CI/CD | GitHub Actions · GitLab CI |
| 其他 | 管理后台 · 用量看板 · 需求知识库 MVP（中文工作台）· 渠道机器人 |

---

## 🛠 快速开始

### 安装仓库依赖

```bash
uv sync
```

### 交互式向导创建项目

```bash
uv run fastapi-fullstack
```

### 命令行直接创建

```bash
uv run fastapi-fullstack new --minimal                    # 纯后端最小项目
uv run fastapi-fullstack create my_app --database sqlite  # SQLite
uv run fastapi-fullstack create my_app --database postgresql --rag
uv run fastapi-fullstack create my_app --frontend nextjs --preset production-saas
uv run fastapi-fullstack templates                        # 查看所有选项/预设
```

生成后用项目自带的 README 和 Makefile 操作：

```bash
cd my_app
make bootstrap    # Docker 全栈：build + up + 迁移 + seed
```

---

## 📁 目录结构

| 路径 | 用途 |
|---|---|
| `fastapi_gen/` | 生成器：CLI、Pydantic 配置模型、交互式提示、Cookiecutter 调用 |
| `template/` | 应用模板：后端、前端、文档、Docker、生成后 hooks |
| `tests/` | 生成器与模板契约测试 |
| `ai_agent_test/` | WorkMate 企业员工 AI 助手（生成的真实应用，见上）|
| `docs/` | 架构文档、需求知识库 PRD、规格、演示说明 |
| `scripts/` | 仓库级验证与预览脚本 |

---

## 🔧 开发

### 验证

```bash
uv run pytest            # 全部测试
uv run ruff check . --fix
uv run ruff format .
uv run ty check fastapi_gen
```

### 添加功能

**新增生成器选项**：`config.py` 加枚举 → `prompts.py` 加提示 → `cookiecutter.json` 加默认值 → `template/` 加条件 → `post_gen_project.py` 加清理 → `VARIABLES.md` 加文档。

**新增向量库**：`VectorStoreType` 加值 → `vectorstore.py` 加适配器 → 接通依赖与 RAG 命令。

**新增需求知识库工作流**：后端 service 保持行为源头 → `schemas/rag.py` 扩展 → `knowledge_bases.py` 加路由 → 更新测试与前端。

---

## 📜 License

见 [LICENSE](LICENSE)。
