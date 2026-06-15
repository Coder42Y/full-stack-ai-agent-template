#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PROJECT_NAME="${REQ_KB_PREVIEW_PROJECT_NAME:-req_kb_preview_live}"
WORK_ROOT="${REQ_KB_PREVIEW_WORK_ROOT:-/home/KrisAgent/tmp/req_kb_preview_live}"
PROJECT_DIR="$WORK_ROOT/$PROJECT_NAME"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

HOST="${REQ_KB_PREVIEW_HOST:-0.0.0.0}"
LAN_HOST="${REQ_KB_PREVIEW_LAN_HOST:-$(hostname -I | awk '{print $1}')}"
BACKEND_PORT="${REQ_KB_PREVIEW_BACKEND_PORT:-8782}"
FRONTEND_PORT="${REQ_KB_PREVIEW_FRONTEND_PORT:-8783}"
FRONTEND_MODE="${REQ_KB_PREVIEW_FRONTEND_MODE:-production}"

DB_CONTAINER="${REQ_KB_PREVIEW_DB_CONTAINER:-req_kb_preview_pgvector}"
POSTGRES_HOST="${REQ_KB_PREVIEW_POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${REQ_KB_PREVIEW_POSTGRES_PORT:-15433}"
POSTGRES_USER="${REQ_KB_PREVIEW_POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${REQ_KB_PREVIEW_POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${REQ_KB_PREVIEW_POSTGRES_DB:-req_kb_preview_live}"

BACKEND_SESSION="${REQ_KB_PREVIEW_BACKEND_SESSION:-req-kb-preview-backend}"
FRONTEND_SESSION="${REQ_KB_PREVIEW_FRONTEND_SESSION:-req-kb-preview-frontend}"
BACKEND_LOG="${REQ_KB_PREVIEW_BACKEND_LOG:-/tmp/req-kb-preview-backend.log}"
FRONTEND_LOG="${REQ_KB_PREVIEW_FRONTEND_LOG:-/tmp/req-kb-preview-frontend.log}"
COOKIE_JAR="${REQ_KB_PREVIEW_COOKIE_JAR:-/tmp/req-kb-preview.cookies}"
UV_HOME="${REQ_KB_PREVIEW_UV_HOME:-/tmp/req-kb-home}"
UV_CACHE="${UV_CACHE_DIR:-/tmp/uv-cache}"
GENERATED_PYTHON="${REQ_KB_PREVIEW_PYTHON:-python3.11}"

backend_url_public="http://$LAN_HOST:$BACKEND_PORT"
frontend_url="http://$LAN_HOST:$FRONTEND_PORT/kb"
backend_url_local="http://127.0.0.1:$BACKEND_PORT"
frontend_url_local="http://127.0.0.1:$FRONTEND_PORT"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

kill_port() {
  local port="$1"
  local pid
  pid="$(ss -ltnp 2>/dev/null | awk -v port=":$port" '$4 ~ port {print $NF}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
}

wait_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "$label did not become ready: $url" >&2
  return 1
}

wait_postgres() {
  local attempts="${1:-60}"
  for _ in $(seq 1 "$attempts"); do
    if docker exec "$DB_CONTAINER" pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres container '$DB_CONTAINER' did not become ready." >&2
  return 1
}

ensure_postgres_container() {
  if docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER")" != "true" ]; then
      docker start "$DB_CONTAINER" >/dev/null
    fi
    wait_postgres
    return 0
  fi

  docker run -d \
    --name "$DB_CONTAINER" \
    -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -p "$POSTGRES_PORT:5432" \
    pgvector/pgvector:pg16 >/dev/null
  wait_postgres
}

ensure_pgvector_extension() {
  local sql="CREATE EXTENSION IF NOT EXISTS vector;"
  if ! docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -tc "$sql" >/dev/null; then
    echo "Postgres container '$DB_CONTAINER' does not provide the pgvector extension." >&2
    echo "Use the default preview container or set REQ_KB_PREVIEW_DB_CONTAINER to a pgvector-enabled Postgres." >&2
    exit 1
  fi
}

echo "== Req KB preview startup =="
echo "repo: $REPO"
echo "work dir: $PROJECT_DIR"
echo "frontend: $frontend_url"
echo "frontend mode: $FRONTEND_MODE"
echo "backend: $backend_url_public"

need uv
need tmux
need curl
need npm
need docker

mkdir -p "$(dirname "$WORK_ROOT")" "$UV_HOME" "$UV_CACHE"

echo
echo "== stop old preview sessions =="
tmux kill-session -t "$BACKEND_SESSION" 2>/dev/null || true
tmux kill-session -t "$FRONTEND_SESSION" 2>/dev/null || true
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

echo
echo "== generate latest template =="
rm -rf "$WORK_ROOT"
HOME="$UV_HOME" UV_CACHE_DIR="$UV_CACHE" uv run python - <<PY
from pathlib import Path
from fastapi_gen.config import (
    BackgroundTaskType,
    DatabaseType,
    FrontendType,
    ProjectConfig,
    RAGFeatures,
    VectorStoreType,
)
from fastapi_gen.generator import generate_project

config = ProjectConfig(
    project_name="$PROJECT_NAME",
    database=DatabaseType.POSTGRESQL,
    frontend=FrontendType.NEXTJS,
    python_version="3.11",
    background_tasks=BackgroundTaskType.NONE,
    enable_redis=False,
    enable_docker=True,
    enable_i18n=False,
    enable_teams=True,
    enable_websockets=True,
    rag_features=RAGFeatures(enable_rag=True, vector_store=VectorStoreType.PGVECTOR),
)
print(generate_project(config, Path("$WORK_ROOT")))
PY

echo
echo "== prepare database =="
ensure_postgres_container
sleep 2
if ! docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -tc "SELECT 1" >/dev/null; then
  echo "Cannot reach Postgres container '$DB_CONTAINER' as user '$POSTGRES_USER'." >&2
  exit 1
fi
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -tc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$POSTGRES_DB';" >/dev/null
docker exec "$DB_CONTAINER" dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" >/dev/null
docker exec "$DB_CONTAINER" createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
ensure_pgvector_extension

echo
echo "== install backend deps and migrate =="
HOME="$UV_HOME" UV_CACHE_DIR="$UV_CACHE" UV_PYTHON_DOWNLOADS=never \
  uv sync --project "$BACKEND_DIR" --extra dev --python "$GENERATED_PYTHON"
(
  cd "$BACKEND_DIR"
  POSTGRES_HOST="$POSTGRES_HOST" \
  POSTGRES_PORT="$POSTGRES_PORT" \
  POSTGRES_USER="$POSTGRES_USER" \
  POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  POSTGRES_DB="$POSTGRES_DB" \
  OPENAI_API_KEY="${OPENAI_API_KEY:-dummy}" \
  ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-dummy}" \
  ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://claude.purvar.local}" \
  ./.venv/bin/python -m alembic upgrade head
)

echo
echo "== install frontend deps and type-check =="
(
  cd "$FRONTEND_DIR"
  npm install
  npm run type-check
  if [ "$FRONTEND_MODE" = "production" ]; then
    BACKEND_URL="$backend_url_local" \
    NEXT_PUBLIC_API_URL="$backend_url_public" \
    NEXT_PUBLIC_WS_URL="ws://$LAN_HOST:$BACKEND_PORT" \
    npm run build
    mkdir -p .next/standalone/.next
    rm -rf .next/standalone/.next/static
    cp -R .next/static .next/standalone/.next/static
    if [ -d public ]; then
      cp -R public .next/standalone/public
    fi
  fi
)

echo
echo "== start backend/frontend in tmux =="
cat > "$WORK_ROOT/backend.env" <<EOF
POSTGRES_HOST=$POSTGRES_HOST
POSTGRES_PORT=$POSTGRES_PORT
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
OPENAI_API_KEY=${OPENAI_API_KEY:-dummy}
ANTHROPIC_AUTH_TOKEN=${ANTHROPIC_AUTH_TOKEN:-dummy}
ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-http://claude.purvar.local}
RAG_DETERMINISTIC_EMBEDDINGS=true
EOF
chmod 600 "$WORK_ROOT/backend.env"

tmux new-session -d -s "$BACKEND_SESSION" \
  "cd '$BACKEND_DIR' && set -a && . '$WORK_ROOT/backend.env' && set +a && ./.venv/bin/uvicorn app.main:app --host '$HOST' --port '$BACKEND_PORT' 2>&1 | tee '$BACKEND_LOG'"

if [ "$FRONTEND_MODE" = "production" ]; then
  tmux new-session -d -s "$FRONTEND_SESSION" \
    "cd '$FRONTEND_DIR/.next/standalone' && BACKEND_URL='$backend_url_local' NEXT_PUBLIC_API_URL='$backend_url_public' NEXT_PUBLIC_WS_URL='ws://$LAN_HOST:$BACKEND_PORT' HOSTNAME='$HOST' PORT='$FRONTEND_PORT' node server.js 2>&1 | tee '$FRONTEND_LOG'"
else
  tmux new-session -d -s "$FRONTEND_SESSION" \
    "cd '$FRONTEND_DIR' && BACKEND_URL='$backend_url_local' NEXT_PUBLIC_API_URL='$backend_url_public' NEXT_PUBLIC_WS_URL='ws://$LAN_HOST:$BACKEND_PORT' npm run dev -- -H '$HOST' -p '$FRONTEND_PORT' 2>&1 | tee '$FRONTEND_LOG'"
fi

echo
echo "== smoke checks =="
wait_http "$backend_url_local/api/v1/health" "backend"
wait_http "$frontend_url_local/kb" "frontend"
rm -f "$COOKIE_JAR"
curl -fsS -c "$COOKIE_JAR" -X POST "$frontend_url_local/api/auth/demo-admin" \
  -H "Content-Type: application/json" -d "{}" >/tmp/req-kb-preview-demo-admin.json
curl -fsS -b "$COOKIE_JAR" "$frontend_url_local/api/kb" >/tmp/req-kb-preview-kb.json

echo
echo "Preview ready:"
echo "  Frontend: $frontend_url"
echo "  Backend health: $backend_url_public/api/v1/health"
echo "  Backend tmux: $BACKEND_SESSION"
echo "  Frontend tmux: $FRONTEND_SESSION"
echo "  Backend log: $BACKEND_LOG"
echo "  Frontend log: $FRONTEND_LOG"
echo "  Smoke: /tmp/req-kb-preview-demo-admin.json /tmp/req-kb-preview-kb.json"
