#!/usr/bin/env bash
set -u

REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG="${REQ_KB_MVP_LOG:-/tmp/req-kb-mvp-verify.log}"
SUMMARY="${REQ_KB_MVP_SUMMARY:-/tmp/req-kb-mvp-automation.summary.md}"
PG_OUT="${REQ_KB_MVP_PG_OUT:-/tmp/req_kb_mvp_verify_pg}"
SQLITE_OUT="${REQ_KB_MVP_SQLITE_OUT:-/tmp/req_kb_mvp_verify_sqlite}"
UV_HOME="${REQ_KB_MVP_HOME:-/tmp/req-kb-home}"
UV_CACHE="${UV_CACHE_DIR:-/tmp/uv-cache}"
RUFF_BIN="${RUFF_BIN:-$REPO/.venv/bin/ruff}"
GENERATED_PYTHON="${REQ_KB_MVP_GENERATED_PYTHON:-python3.11}"
PG_BACKEND="$PG_OUT/req_kb_mvp_verify_pg/backend"
SQLITE_BACKEND="$SQLITE_OUT/req_kb_mvp_verify_sqlite/backend"

mkdir -p "$(dirname "$LOG")" "$(dirname "$SUMMARY")" "$UV_HOME" "$UV_CACHE"
exec > >(tee "$LOG") 2>&1

status=0

run_step() {
  echo
  echo "## $1"
  shift
  "$@"
  code=$?
  echo "exit_code=$code"
  if [ "$code" -ne 0 ]; then
    status=1
  fi
  return 0
}

generate_pg_demo() {
  HOME="$UV_HOME" UV_CACHE_DIR="$UV_CACHE" uv run python -c "
from pathlib import Path
import shutil
from fastapi_gen.config import BackgroundTaskType, DatabaseType, ProjectConfig, RAGFeatures, VectorStoreType
from fastapi_gen.generator import generate_project

out = Path('$PG_OUT')
shutil.rmtree(out, ignore_errors=True)
config = ProjectConfig(
    project_name='req_kb_mvp_verify_pg',
    database=DatabaseType.POSTGRESQL,
    python_version='3.11',
    background_tasks=BackgroundTaskType.NONE,
    enable_redis=False,
    enable_docker=True,
    enable_teams=True,
    enable_websockets=True,
    rag_features=RAGFeatures(enable_rag=True, vector_store=VectorStoreType.PGVECTOR),
)
print(generate_project(config, out))
"
}

generate_sqlite_guard() {
  HOME="$UV_HOME" UV_CACHE_DIR="$UV_CACHE" uv run python -c "
from pathlib import Path
import shutil
from fastapi_gen.config import BackgroundTaskType, DatabaseType, OrmType, ProjectConfig, RAGFeatures, VectorStoreType
from fastapi_gen.generator import generate_project

out = Path('$SQLITE_OUT')
shutil.rmtree(out, ignore_errors=True)
config = ProjectConfig(
    project_name='req_kb_mvp_verify_sqlite',
    database=DatabaseType.SQLITE,
    orm_type=OrmType.SQLMODEL,
    python_version='3.11',
    background_tasks=BackgroundTaskType.NONE,
    enable_redis=False,
    enable_docker=True,
    enable_teams=True,
    enable_websockets=True,
    rag_features=RAGFeatures(enable_rag=True, vector_store=VectorStoreType.CHROMADB),
)
print(generate_project(config, out))
"
}

check_frontend_templates() {
  test -f "$REPO/template/{{cookiecutter.project_slug}}/frontend/src/app/api/kb/[id]/requirements/from-text/route.ts" \
    -a -f "$REPO/template/{{cookiecutter.project_slug}}/frontend/src/app/api/kb/[id]/query/route.ts" \
    -a -f "$REPO/template/{{cookiecutter.project_slug}}/frontend/src/app/api/kb/[id]/documents/[docId]/breakdown/route.ts" \
    -a -f "$REPO/template/{{cookiecutter.project_slug}}/frontend/src/app/api/kb/[id]/documents/[docId]/change/route.ts" \
    -a -f "$REPO/template/{{cookiecutter.project_slug}}/frontend/src/app/api/auth/demo-admin/route.ts" \
    -a -f "$REPO/template/{{cookiecutter.project_slug}}/frontend/src/components/requirements/requirement-project-list.tsx" \
    -a -f "$REPO/template/{{cookiecutter.project_slug}}/frontend/src/components/requirements/requirement-workbench.tsx"
}

sync_pg_backend() {
  HOME="$UV_HOME" UV_CACHE_DIR="$UV_CACHE" UV_PYTHON_DOWNLOADS=never \
    uv sync --project "$PG_BACKEND" --extra dev --frozen --python "$GENERATED_PYTHON"
}

run_pg_core_tests() {
  old_pwd="$(pwd)"
  cd "$PG_BACKEND" || return 1
  ./.venv/bin/pytest -q tests/test_requirement_query.py tests/test_rbac_teams.py
  code=$?
  cd "$old_pwd" || return "$code"
  return "$code"
}

echo "# Req KB MVP verification"
date -Iseconds
cd "$REPO" || exit 1

run_step "git status" git status --short --branch
run_step "unstaged diff check" git diff --check
run_step "staged diff check" git diff --cached --check
run_step "repo ruff" env HOME="$UV_HOME" UV_CACHE_DIR="$UV_CACHE" uv run --extra dev ruff check fastapi_gen tests
run_step "template contract tests" env HOME="$UV_HOME" UV_CACHE_DIR="$UV_CACHE" uv run --extra dev pytest -q tests/test_req_kb_mvp_template.py
run_step "generate PostgreSQL backend demo" generate_pg_demo
run_step "PostgreSQL backend compile" python3 -m compileall -q "$PG_BACKEND/app" "$PG_BACKEND/tests"
run_step "PostgreSQL backend ruff" "$RUFF_BIN" check "$PG_BACKEND/app" "$PG_BACKEND/tests"
run_step "PostgreSQL backend dependency sync" sync_pg_backend
run_step "PostgreSQL generated core tests" run_pg_core_tests
run_step "generate SQLite guard demo" generate_sqlite_guard
run_step "SQLite backend compile" python3 -m compileall -q "$SQLITE_BACKEND/app" "$SQLITE_BACKEND/tests"
run_step "SQLite backend ruff" "$RUFF_BIN" check "$SQLITE_BACKEND/app" "$SQLITE_BACKEND/tests"
run_step "frontend BFF templates present" check_frontend_templates

cat > "$SUMMARY" <<EOF
# Req KB MVP Automation Summary

Date: $(date -Iseconds)
Branch: $(git branch --show-current)
tmux session: ${REQ_KB_MVP_TMUX_SESSION:-req-kb-mvp-verify}
tmux log: $LOG

## Implemented demo scope

- PRD and feature-split specs are tracked under docs/.
- M0/M1: Markdown source storage, version metadata, project_name, product/developer/tester roles, DOCX Mammoth markdown ingestion.
- M2: one-sentence requirement intake is AI-first through an Anthropic Messages-compatible adapter with primary/fallback model routing, creates a tracked Markdown document, returns clarification questions, and the frontend can apply clarification answers as a new version.
- M3: grounded query returns source-labelled excerpts, prioritizes clarified answer sections, can ask the requirement AI to answer from those sources, and falls back to stored Markdown when vector retrieval is unavailable.
- M4: requirement breakdown returns section-level citations and tester-focused notes.
- M5/M6: change workflow records developer suggestions, creates drafts, applies product version snapshots, and lets product apply draft versions from history.
- M7: MVP role selection uses X-Requirement-Role; product can write, developer can query/break down/suggest but not directly mutate documents.
- M8: intake/change/draft-approval flows return notification_event payloads and broadcast them over the existing WebSocket manager as requirement_notification.
- Frontend BFF route templates, hooks/types, Chinese requirement project list/workbench, product/developer role selector, and MVP demo-admin auto-auth are present for the demo workflow.

## Verification

- git diff --check
- git diff --cached --check
- repo ruff over fastapi_gen and tests
- template contract pytest: tests/test_req_kb_mvp_template.py
- generated PostgreSQL backend compile/ruff: $PG_OUT/req_kb_mvp_verify_pg
- generated PostgreSQL core pytest: tests/test_requirement_query.py and tests/test_rbac_teams.py
- generated SQLite guard backend compile/ruff: $SQLITE_OUT/req_kb_mvp_verify_sqlite
- frontend BFF/Chinese workbench/demo-admin template presence checks

## Current limits

- Full generated-project pytest is intentionally outside this fast verifier; the generated core Req KB/RBAC tests are included.
- Live FastAPI startup and HTTP demo flow are separate from this static verifier; see docs/req-kb-mvp-demo.md.
- Redis/pubsub cross-process notification fan-out, read receipts, and toast notification center remain follow-up.
- Persistent multi-turn clarification state and structured red/green diff approval UI remain follow-up.

Overall exit status: $status
EOF

echo
echo "## summary"
cat "$SUMMARY"
exit "$status"
