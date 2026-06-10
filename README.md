# Full-Stack AI Agent Template

An opinionated project generator for building production-style AI applications with
FastAPI, Next.js, agent frameworks, RAG, background workers, billing, teams, and
deployment scaffolding.

This repository is the generator. It contains the CLI, configuration models,
interactive prompts, Cookiecutter template, cleanup hooks, tests, and a generated
sample app used to validate the template.

<p align="center">
  <img src="assets/new2/chat_demo.gif" alt="Generated AI chat experience" width="100%">
</p>

## What You Get

The generator creates a full application instead of a thin starter:

- FastAPI backend with typed settings, routers, services, repositories, schemas,
  database migrations, auth, admin workflows, and health checks.
- Optional Next.js 15 frontend with dashboard, chat UI, organization management,
  billing screens, settings pages, RAG management, and marketing pages.
- AI agent runtime choices including PydanticAI, LangChain, LangGraph, CrewAI,
  DeepAgents, and related integration paths.
- RAG ingestion and retrieval with vector store options, embedding providers,
  reranking, document parsing, file upload, source sync, and knowledge bases.
- Production-oriented infrastructure files for Docker Compose, Redis, task
  queues, Kubernetes, Nginx, environment examples, and operational commands.
- SaaS features such as JWT auth, OAuth, organizations, invitations, teams,
  Stripe billing, admin views, audit-friendly services, and message ratings.

## Quick Start

Install dependencies for this repository:

```bash
uv sync
```

Inspect available generator options:

```bash
uv run fastapi-fullstack templates
```

Create a project with the interactive wizard:

```bash
uv run fastapi-fullstack
```

Create a project with explicit options:

```bash
uv run fastapi-fullstack create my_ai_app \
  --database postgresql \
  --frontend nextjs \
  --rag \
  --task-queue celery
```

After generation:

```bash
cd my_ai_app
make bootstrap
```

`make bootstrap` starts the generated local stack, applies migrations, and seeds
the default admin user when the selected options support those workflows.

## CLI Shape

```bash
fastapi-fullstack                                  # interactive wizard
fastapi-fullstack create my_app --database sqlite
fastapi-fullstack create my_app --database postgresql --rag
fastapi-fullstack create my_app --task-queue celery --frontend nextjs
fastapi-fullstack templates                        # list supported options
```

Generated projects include command modules for operational tasks, including RAG
source management:

```bash
uv run <project_slug> cmd rag-sources
uv run <project_slug> cmd rag-source-add
uv run <project_slug> cmd rag-source-sync
```

## Main Choices

| Area | Options |
| --- | --- |
| Backend | FastAPI, Pydantic, SQLAlchemy, Alembic |
| Frontend | Next.js 15, React, Tailwind, generated UI flows |
| Databases | SQLite, PostgreSQL, MongoDB-oriented paths where configured |
| Agent frameworks | PydanticAI, LangChain, LangGraph, CrewAI, DeepAgents |
| LLM providers | OpenAI, Anthropic, Google Gemini, OpenRouter |
| RAG stores | Milvus, Qdrant, ChromaDB, pgvector |
| Background work | Celery, Taskiq, ARQ, or no queue depending on selection |
| Observability | Logfire for PydanticAI paths, LangSmith for LangChain-style paths |
| Deployment | Docker Compose, production Compose, Kubernetes, Nginx |

## Repository Layout

```text
fastapi_gen/
  cli.py          # Click CLI entrypoints
  config.py       # Pydantic config models, enums, validation, template context
  prompts.py      # Questionary interactive wizard
  generator.py    # Cookiecutter invocation

template/
  cookiecutter.json
  hooks/post_gen_project.py
  {{cookiecutter.project_slug}}/
    backend/
    frontend/
    docs/
    docker-compose*.yml

tests/
  test_cli.py
  test_config.py
  test_generator.py
  test_template_integration.py

ai_agent_test/
  generated sample project used for local validation
```

## Development Commands

```bash
uv sync
uv run pytest
uv run ruff check . --fix
uv run ruff format .
uv run mypy fastapi_gen
```

For template-aware checks:

```bash
uv run pytest tests/test_template_integration.py
uv run pytest tests/test_template_docs.py
```

## How Generation Works

1. The CLI receives explicit flags or launches the interactive wizard.
2. `ProjectConfig` validates options and rejects incompatible combinations.
3. The config is converted into Cookiecutter context values.
4. Cookiecutter renders the selected backend, frontend, infrastructure, and docs.
5. `post_gen_project.py` removes files that do not apply to the chosen stack and
   optionally formats generated output.

This keeps the generator code small while allowing the rendered project to be
feature-rich.

## RAG Support

Generated RAG projects can include:

- Document upload and ingestion endpoints.
- Local file ingestion commands.
- Google Drive and S3/MinIO sync connectors.
- Runtime-selectable PDF parsing paths.
- Vector store adapters for Milvus, Qdrant, ChromaDB, and pgvector.
- Embedding provider configuration.
- Optional reranking and image description support.
- Knowledge base screens in the generated frontend.

## Generated App Surface

Depending on selected options, generated applications can include:

- Streaming chat and tool-call rendering.
- Conversation persistence and sharing.
- File upload and preview flows.
- Organization and team management.
- Billing, invoices, credits, subscriptions, and Stripe webhook handling.
- Admin users, admin conversations, ratings, and system pages.
- Slash commands and prompt template management.
- Slack and Telegram webhook integration paths.

## Extending The Template

Adding a new generator option usually touches:

1. `fastapi_gen/config.py`
2. `fastapi_gen/prompts.py`
3. `template/cookiecutter.json`
4. Template conditionals under `template/{{cookiecutter.project_slug}}/`
5. `template/hooks/post_gen_project.py`
6. `template/VARIABLES.md`

Adding a new vector store usually touches:

1. `VectorStoreType` and context flags in `fastapi_gen/config.py`
2. `backend/app/services/rag/vectorstore.py`
3. Backend dependency wiring and RAG commands
4. Agent RAG tools
5. Docker services or dependencies when required

Adding a new sync connector usually touches:

1. `backend/app/services/rag/connectors/`
2. Connector registration
3. RAG commands
4. Sync source schemas
5. Worker tasks

## Visual Overview

`repo-intro.html` is a standalone visual overview page for this repository. It is
useful when explaining the project to someone who does not want to read the full
README first.

When sharing that page outside the repository, include the `assets/` directory so
the screenshots and GIFs continue to render.

## Notes

- This repository contains both generator code and a generated validation app.
- Generated projects should review `.env.example` values before deployment.
- Production deployment requires real secrets, domain-specific Nginx settings,
  persistent database storage, and provider credentials.
- The template is intentionally broad. For small projects, start with fewer
  options and add integrations only when they are needed.

## License

This project is distributed under the license included in [LICENSE](LICENSE).
