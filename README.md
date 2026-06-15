# Requirement KB Full-Stack Generator

This repository is a project generator. It produces FastAPI + Next.js applications
with AI agents, RAG, teams, billing, admin workflows, and deployment scaffolding.

The current `main` branch also includes a requirement knowledge-base MVP path. It
turns the generated app into an internal Chinese-first requirement system where
product managers can create and revise requirements, while developers and testers
query, break down, and suggest changes against cited source material.

## What This Repo Contains

| Path | Purpose |
| --- | --- |
| `fastapi_gen/` | Click CLI, Pydantic config models, prompts, and Cookiecutter invocation. |
| `template/` | The generated app template: backend, optional frontend, docs, Docker, hooks. |
| `tests/` | Generator and template contract tests. |
| `ai_agent_test/` | A generated validation app checked into the repo for development reference. |
| `docs/` | Architecture docs plus the requirement KB PRD, specs, demo notes, and test plan. |
| `scripts/` | Repo-level verification and live preview helpers. |

## Generated Stack

The generator can create a backend-only API or a full-stack app.

| Area | Options / implementation |
| --- | --- |
| Backend | FastAPI, Pydantic v2, SQLAlchemy or SQLModel, Alembic, service/repository layers. |
| Frontend | Optional Next.js 15 App Router frontend with dashboard, chat, KB, admin, billing, and settings flows. |
| Databases | PostgreSQL, SQLite, MongoDB-oriented paths where configured. |
| Auth | JWT, refresh tokens, API keys, local auth, delegated IdP JWT validation, optional Google OAuth. |
| AI frameworks | PydanticAI, LangChain, LangGraph, CrewAI, DeepAgents, PydanticDeep, or no AI. |
| LLM providers | OpenAI, Anthropic, Google Gemini, OpenRouter, or all providers for runtime selection. |
| RAG | Milvus, Qdrant, ChromaDB, pgvector, embeddings, reranking, document parsing, sync sources. |
| Operations | Docker Compose, optional Kubernetes, Nginx/Traefik config, CI, Redis, task queues. |
| SaaS | Organizations, teams, invitations, Stripe billing, credits, admin screens, usage views. |

Run this to see the currently supported flags and presets:

```bash
uv run fastapi-fullstack templates
```

## Requirement KB MVP

The active product direction on `main` is the requirement knowledge-base demo.
It is generated when the template uses PostgreSQL, JWT auth, teams, RAG, and the
pgvector path. The frontend workbench is available under `/kb` when Next.js is
enabled.

Implemented demo workflow:

- Product creates a requirement project.
- Product uploads requirement documents or creates a requirement from one sentence.
- The backend stores full Markdown source in `RAGDocument.markdown_content`.
- The requirement AI asks clarification questions and can rewrite Markdown.
- Developer/tester queries return answers with `[来源: 文档名 > 章节名]` citations.
- Documents can be broken down by section with source labels.
- Developer changes are suggestion-only; product changes create drafts or new versions.
- Version history, Markdown diff, and draft approval endpoints are generated.
- Requirement events are returned as `notification_event` payloads and broadcast
  as `requirement_notification` over the existing WebSocket manager.
- The generated Chinese workbench has five modes: 录入, 查询, 拆解, 变更, 历史.

Core generated endpoints:

```text
POST /api/v1/kb/{kb_id}/requirements/from-text
POST /api/v1/kb/{kb_id}/query
GET  /api/v1/kb/{kb_id}/documents/{doc_id}/breakdown
POST /api/v1/kb/{kb_id}/documents/{doc_id}/change
POST /api/v1/kb/{kb_id}/documents/{doc_id}/apply-draft
GET  /api/v1/kb/{kb_id}/documents/{doc_id}/versions
GET  /api/v1/kb/{kb_id}/documents/{doc_id}/diff
```

The requirement AI adapter reads Anthropic Messages-compatible settings:

```bash
ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-5
```

If the model gateway is not configured or fails, generated projects keep a
deterministic local fallback so the demo and tests remain runnable.

See [docs/req-kb-prd.md](docs/req-kb-prd.md) and
[docs/req-kb-mvp-demo.md](docs/req-kb-mvp-demo.md) for the product spec and demo
flow.

## Quick Start

Install repository dependencies:

```bash
uv sync
```

Create a project with the interactive wizard:

```bash
uv run fastapi-fullstack
```

Create a backend-only minimal project:

```bash
uv run fastapi-fullstack new --minimal
```

Create a requirement KB demo project:

```bash
uv run fastapi-fullstack create req_kb_demo \
  --database postgresql \
  --frontend nextjs \
  --rag \
  --vector-store pgvector \
  --teams \
  --websockets \
  --task-queue none \
  --python-version 3.11
```

Then follow the generated project's README. For the full-stack Docker path this
usually starts with:

```bash
cd req_kb_demo
make bootstrap
```

## Live Preview

For the current requirement KB MVP, this repo includes a one-command preview:

```bash
bash scripts/start_req_kb_preview.sh
```

The script regenerates the latest template into a temporary directory, starts a
pgvector PostgreSQL container, applies migrations, installs frontend/backend
dependencies, starts backend and frontend in tmux, and smoke-checks `/kb`.

Default local preview outputs are printed by the script. The important routes
are:

```text
Frontend: /kb
Backend health: /api/v1/health
```

Prerequisites for the preview script: `uv`, `docker`, `tmux`, `npm`, and `curl`.

## Verification

General development checks:

```bash
uv run pytest
uv run ruff check . --fix
uv run ruff format .
uv run ty check fastapi_gen
```

Requirement KB MVP verification:

```bash
bash scripts/verify_req_kb_mvp.sh
```

That script currently checks:

- `git diff --check`
- repo ruff over `fastapi_gen` and `tests`
- `tests/test_req_kb_mvp_template.py`
- generated PostgreSQL requirement KB backend compile, ruff, and focused tests
- generated SQLite guard compile and ruff
- frontend BFF/workbench template presence

## CLI Shape

```bash
fastapi-fullstack
fastapi-fullstack new --minimal
fastapi-fullstack new --no-input --name my_app
fastapi-fullstack create my_app --database sqlite
fastapi-fullstack create my_app --database postgresql --rag
fastapi-fullstack create my_app --frontend nextjs --preset production-saas
fastapi-fullstack templates
```

Generated projects also include operational commands. RAG-enabled projects expose
local ingestion/search commands and sync-source commands:

```bash
uv run <project_slug> rag-ingest /path/to/docs --collection documents
uv run <project_slug> rag-search "your query" --collection documents
uv run <project_slug> rag-collections
uv run <project_slug> cmd rag-sources
uv run <project_slug> cmd rag-source-add
uv run <project_slug> cmd rag-source-sync
```

## How Generation Works

1. `fastapi_gen/cli.py` receives flags or starts the interactive wizard.
2. `fastapi_gen/config.py` validates option combinations in `ProjectConfig`.
3. The config is converted to Cookiecutter context values.
4. Cookiecutter renders `template/{{cookiecutter.project_slug}}/`.
5. `template/hooks/post_gen_project.py` removes files that do not apply to the selected stack.
6. The generated project README and Makefile become the main operating guide for that app.

## Adding Features

New generator option:

1. Add enum or fields in `fastapi_gen/config.py`.
2. Add prompts in `fastapi_gen/prompts.py`.
3. Add context defaults in `template/cookiecutter.json`.
4. Add template conditionals under `template/{{cookiecutter.project_slug}}/`.
5. Update `template/hooks/post_gen_project.py` cleanup.
6. Document the variable in `template/VARIABLES.md`.

New vector store:

1. Add a `VectorStoreType` value and context flags.
2. Implement the adapter in `backend/app/services/rag/vectorstore.py`.
3. Wire backend dependencies, RAG commands, and agent tools.
4. Add Docker/dependency support if the store needs infrastructure.

New requirement KB workflow:

1. Keep source-of-truth behavior in backend services, not frontend-only code.
2. Extend schemas in `backend/app/schemas/rag.py`.
3. Add route coverage in `backend/app/api/routes/v1/knowledge_bases.py`.
4. Update generated service tests in `backend/tests/test_requirement_query.py`.
5. Update frontend BFF routes, hooks, types, and workbench UI when Next.js is enabled.
6. Add or update contract checks in `tests/test_req_kb_mvp_template.py`.

## Current Limits

- The requirement KB flow is an MVP/demo path, not a complete production approval system.
- Requirement-specific workflow routes are generated for the PostgreSQL RAG + teams path.
- SQLite is kept as a guard path and intentionally does not expose the PostgreSQL-only requirement workflow routes.
- Persistent multi-turn clarification state, structured red/green approval UI,
  Redis cross-process notification fan-out, and read receipts are follow-up work.
- Payment providers other than Stripe are modeled as options, but Stripe is the fully implemented billing path.

## License

This project is distributed under the license included in [LICENSE](LICENSE).
