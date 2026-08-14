# WorkMate — Enterprise Employee AI Assistant

> **English** · [中文](README.zh-CN.md)

An employee-facing AI assistant demo for the enterprise: ask in plain language about expense reimbursements, leave balances, or company policy — every answer comes with its SQL evidence and cited document sources.

**WorkMate** runs a real business loop end to end. Instead of digging through policy PDFs, hunting down HR, or hopping between systems, employees just ask the assistant *"What's my total reimbursement this quarter?"* or *"How does annual leave accrue?"* — the agent queries the business tables through read-only MCP SQL tools, retrieves the policy knowledge base, and returns answers that are traceable and backed by charts.

---

## Why WorkMate?

Most AI chat demos are generic "answer shells" — and that's exactly what interviewers and stakeholders are tired of seeing. WorkMate was rebuilt from an open-source full-stack template, replacing the default "generic AI SaaS" with a concrete enterprise-employee scenario:

- **The data is real.** Three pre-seeded business tables — `employees`, `reimbursements`, `leaves` — are queried by the agent against actual PostgreSQL sample data, not canned responses.
- **Answers are traceable.** Data questions show the SQL statement and a results table; policy questions cite the source document and clause. Nothing is made up.
- **Safe and constrained.** The MCP SQL tool is read-only (`SELECT`/`WITH`), restricted to a whitelist of tables, and capped at a row limit. Embeddings run locally on `bge-small-zh-v1.5` — no external embedding API.
- **Demo-ready out of the box.** A one-command start script, a pre-seeded admin account, and a fully Chinese UI mean you can walk through the whole loop in minutes.

> The stack itself is worth talking about in an interview: DeepSeek (OpenAI-compatible) + pgvector + PydanticAI + ECharts — all mainstream, familiar components.

## Features

- **Expense reimbursement** — query records and totals, aggregate by department / time / status, with expandable SQL evidence
- **Leave & annual leave** — leave history and remaining annual-leave calculation, business rules baked into the prompts
- **Policy Q&A** — employee handbook, reimbursement rules, etc. indexed into pgvector; answers cite the source document
- **Chart rendering** — SQL results render straight into ECharts for trends and comparisons at a glance
- **DeepSeek balance card** — real remaining-credit display on the dashboard
- **Bilingual UI** — next-intl, Chinese by default, one click to English

## Quickstart

One command brings up the whole stack (macOS / Linux):

```bash
./run.sh          # Docker mode (default; first build is slow)
./run.sh --local  # Local mode (bypasses Docker, auto-installs postgres/redis — recommended for local dev)
```

> If you hit network issues under Docker (e.g. Docker Desktop gvisor blocking outbound downloads), just use `--local`.

Once it's up:

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:8000> · Docs <http://localhost:8000/docs>
- Sign in: `admin@example.com` / `admin123`

**Demo path**: sign in → go to **Smart Analysis** (智能分析) → ask away:

```
What are my reimbursement records and total for the last three months?
What are my leave records and remaining annual leave this year?
Show the reimbursement distribution by department this month as a chart.
How does annual leave accrue? Does it roll over to next year?
```

## Usage

### One-command script

```bash
./run.sh                # setup + start (idempotent)
./run.sh --local        # local mode
./run.sh status         # port / health status
./run.sh logs backend   # tail backend logs
./run.sh stop           # stop frontend + backend
./run.sh seed           # recreate the admin account
NO_CHINA_MIRROR=1 ./run.sh --local   # non-CN network, official sources
```

### CLI

The backend ships a Click CLI (`cd backend && uv run ai_agent_test …`):

```bash
ai_agent_test user create --email demo@example.com --password xxx   # create a user
ai_agent_test rag-ingest path/to/doc.pdf -c enterprise_ops          # ingest a policy doc
ai_agent_test rag-search "annual leave policy" -c enterprise_ops    # search the KB
ai_agent_test rag-collections                                      # list collections
```

### Manual dev startup

```bash
# Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000
# Frontend
cd frontend && bun install && bun dev        # http://localhost:3000
```

## Architecture

| Component | Technology |
|---|---|
| Backend | FastAPI + Pydantic v2 |
| Database | PostgreSQL 16 + **pgvector** (vector search) |
| LLM | **DeepSeek** `deepseek-v4-flash` (OpenAI-compatible `/v1`) |
| Embedding | `bge-small-zh-v1.5` (local, 512-dim) |
| Agent | PydanticAI + MCP tools (read-only SQL / KB search / ECharts) |
| Frontend | Next.js 15 + React 19 + Tailwind v4 |
| i18n | next-intl (`zh` default / `en`) |
| Tasks / cache | Celery (optional) / Redis |

### Data flow

```
Employee question ──> PydanticAI Agent ──> MCP tools
                        │                  ├─ read-only SQL (pg_query) → PostgreSQL business tables
                        │                  ├─ KB retrieval (RAG) → pgvector policy docs
                        │                  └─ ECharts → chart data
                        └──> answer (SQL evidence / document citations) back to the frontend
```

### Layout

```
backend/app/
├── main.py            # FastAPI app + lifespan
├── api/routes/v1/     # HTTP endpoints (routes → services → repos)
├── services/          # business logic (incl. rag/ , billing/)
├── agents/            # PydanticAI wrappers + MCP tools (pg_query_server, …)
├── db/models/         # SQLAlchemy (users / conversations / enterprise, …)
├── commands/          # CLI (seed_enterprise / seed_enterprise_kb / seed_prompts, …)
└── alembic/           # DB migrations

frontend/src/
├── app/[locale]/      # next-intl routes (marketing + dashboard)
├── components/        # chat / dashboard / billing / admin / teams, …
├── messages/          # zh.json / en.json (i18n)
└── lib/               # api-client / constants / seo
```

## Configuration

Backend config lives in `backend/.env` (auto-generated from `.env.example` on first `run.sh`). Key variables:

```bash
# DeepSeek (run.sh auto-reads the key from ~/.cc-profiles/ds or the env var)
OPENAI_API_KEY=sk-…
OPENAI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-v4-flash

# PostgreSQL (local mode uses trust auth)
POSTGRES_HOST=localhost
POSTGRES_DB=ai_agent_test

# RAG / Embedding
EMBEDDING_PROVIDER=sentence-transformers
EMBEDDING_MODEL=BAAI/bge-small-zh-v1.5

# MCP
MCP_ENABLED=true
```

`.env` is gitignored — never commit real secrets.

## Development

```bash
# Backend
cd backend
uv run pytest                                      # tests
uv run ruff check . --fix && uv run ruff format .  # lint + format
uv run alembic upgrade head                        # migrate
uv run alembic revision --autogenerate -m "msg"    # new migration

# Frontend
cd frontend
bun run lint        # eslint
bun run build       # production build
bun run test        # vitest
```

## Deployment

- **Docker**: `./run.sh` (default). On a server, use the `pgvector/pgvector:pg16` image (or compile pgvector natively); the bge model runs fine on CPU.
- **Local**: `./run.sh --local`.
- A dedicated server deploy script (`deploy.sh`) is planned, extending the docker/local structure of `run.sh`.

## Contributing

Issues and PRs welcome. Before opening a PR, make sure the backend passes `ruff`, and the frontend passes `bun run lint && bun run build`. i18n copy changes must update both `messages/zh.json` and `messages/en.json`.

## License

Derived from the [Full-Stack AI Agent Template](https://github.com/vstorm-co/full-stack-ai-agent-template) (MIT). This directory carries no standalone LICENSE file; usage follows the upstream license.
