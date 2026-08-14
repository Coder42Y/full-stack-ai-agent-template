#!/usr/bin/env bash
# =============================================================================
# run.sh — ai_agent_test 一键启动脚本
#
# 跨平台：macOS / Linux（Windows 请用 WSL2 / Git Bash）
# 两条路径：
#   docker  默认。docker compose 全套起（backend + postgres + redis + milvus…）。
#           适合 Docker 网络正常的设备。镜像源已切国内加速。
#   local   --local。绕过 Docker（用于 Docker Desktop gvisor 网络 bug 环境），
#           本地 uv 起后端 + bun 起前端 + 自动装 postgres/redis。
#
# 用法：
#   ./run.sh                 # docker 模式，setup + start（幂等）
#   ./run.sh --local         # local 模式，setup + start
#   ./run.sh setup|start|stop|status|logs|seed
#
# DeepSeek key 读取优先级：
#   1) ~/.cc-profiles/ds/settings.json（Claude Code provider 配置）
#   2) 环境变量 DEEPSEEK_API_KEY
#   3) 都没有则留空，AI 对话不可用（其余功能不受影响）
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# 配置区
# ---------------------------------------------------------------------------
# 国内镜像（默认开启；国外环境可 export NO_CHINA_MIRROR=1 关闭）
UV_INDEX_URL="https://mirrors.aliyun.com/pypi/simple/"
BUN_REGISTRY="https://registry.npmmirror.com"
BREW_BOTTLE_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles"
BREW_API_DOMAIN="https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api"

# 后端模型（DeepSeek flash；OpenAI 兼容接口已验证可用）
AI_MODEL="${AI_MODEL:-deepseek-v4-flash}"
OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.deepseek.com/v1}"

# 目录（基于脚本所在位置，可被软链/别处调用）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.dev.yml"
RUN_DIR="$SCRIPT_DIR/.run"          # local 模式存 PID
LOG_DIR="$SCRIPT_DIR/logs"

# 数据库默认值（local 模式用；docker 模式由 compose 里的环境变量决定）
PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5432}"
PG_USER="${POSTGRES_USER:-kris}"          # macOS brew 默认超管=当前用户；Linux 可覆盖
PG_DB="${POSTGRES_DB:-ai_agent_test}"

# ---------------------------------------------------------------------------
# 输出辅助
# ---------------------------------------------------------------------------
C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'; C_RESET=$'\033[0m'
info()  { printf "${C_GREEN}[info]${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[warn]${C_RESET} %s\n" "$*"; }
err()   { printf "${C_RED}[err]${C_RESET} %s\n" "$*" >&2; }
step()  { printf "${C_CYAN}▶ %s${C_RESET}\n" "$*"; }

# ---------------------------------------------------------------------------
# 平台与工具检测
# ---------------------------------------------------------------------------
OS="$(uname -s)"
is_macos() { [ "$OS" = "Darwin" ]; }
is_linux() { [ "$OS" = "Linux" ]; }

have() { command -v "$1" >/dev/null 2>&1; }

require_cmd() {
  local c="$1" hint="$2"
  if ! have "$c"; then
    err "缺少命令: $c — $hint"
    exit 1
  fi
}

# 国内镜像开关
use_china_mirror() { [ -z "${NO_CHINA_MIRROR:-}" ]; }

# 导出 uv / bun 镜像环境变量
export_mirrors() {
  if use_china_mirror; then
    export UV_INDEX_URL UV_DEFAULT_INDEX="$UV_INDEX_URL"
    export BUN_CONFIG_REGISTRY="$BUN_REGISTRY"
    if is_macos && have brew; then
      export HOMEBREW_NO_AUTO_UPDATE=1
      export HOMEBREW_BOTTLE_DOMAIN="$BREW_BOTTLE_DOMAIN"
      export HOMEBREW_API_DOMAIN="$BREW_API_DOMAIN"
    fi
    info "使用国内镜像（uv→阿里云, bun→npmmirror, brew→清华）"
  else
    info "使用官方源（NO_CHINA_MIRROR 已设置）"
  fi
}

# ---------------------------------------------------------------------------
# DeepSeek key 读取
# ---------------------------------------------------------------------------
read_deepseek_key() {
  local key=""
  # 1) cc profile
  local cc_profile="$HOME/.cc-profiles/ds/settings.json"
  if [ -f "$cc_profile" ] && have python3; then
    key="$(python3 -c "
import json
try:
    d = json.load(open('$cc_profile'))
    print(d.get('env', {}).get('ANTHROPIC_AUTH_TOKEN', ''))
except Exception:
    print('')
" 2>/dev/null || true)"
  fi
  # 2) 环境变量
  [ -z "$key" ] && key="${DEEPSEEK_API_KEY:-}"
  printf '%s' "$key"
}

# ---------------------------------------------------------------------------
# 依赖安装（local 模式）
# ---------------------------------------------------------------------------
ensure_uv() {
  if ! have uv; then
    step "安装 uv…"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    if ! have uv; then err "uv 安装失败"; exit 1; fi
  fi
  info "uv: $(uv --version 2>/dev/null)"
}

ensure_bun() {
  if ! have bun; then
    step "安装 bun…"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    if ! have bun; then err "bun 安装失败"; exit 1; fi
  fi
  info "bun: $(bun --version 2>/dev/null)"
}

# 返回 postgres 可执行文件路径（brew keg-only / Linux PATH）
pg_bin() {
  if is_macos && [ -x /opt/homebrew/opt/postgresql@16/bin/psql ]; then
    echo /opt/homebrew/opt/postgresql@16/bin
  elif is_macos && [ -x /usr/local/opt/postgresql@16/bin/psql ]; then
    echo /usr/local/opt/postgresql@16/bin
  else
    echo ""   # Linux 用 PATH 里的 psql
  fi
}

install_postgres_local() {
  local bin_dir
  bin_dir="$(pg_bin)"
  if [ -n "$bin_dir" ] && [ -x "$bin_dir/psql" ]; then
    info "PostgreSQL 已安装: $bin_dir"
  elif have psql; then
    info "PostgreSQL 已安装（PATH）"
  elif is_macos; then
    step "安装 PostgreSQL@16（brew + 清华镜像）…"
    brew install postgresql@16
  elif have apt-get; then
    step "安装 PostgreSQL（apt）…"
    sudo apt-get update -y
    sudo apt-get install -y postgresql postgresql-contrib
  else
    err "无法自动安装 PostgreSQL（未知包管理器），请手动安装后重试"
    exit 1
  fi
}

start_postgres_local() {
  local bin_dir pg_isready_cmd
  bin_dir="$(pg_bin)"
  pg_isready_cmd="pg_isready"
  [ -n "$bin_dir" ] && pg_isready_cmd="$bin_dir/pg_isready"

  # 已监听则跳过
  if "$pg_isready_cmd" -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
    info "PostgreSQL 已在 $PG_HOST:$PG_PORT 运行"
    return 0
  fi

  step "启动 PostgreSQL…"
  if is_macos; then
    brew services start postgresql@16 >/dev/null 2>&1 || brew services start postgresql >/dev/null 2>&1
  elif have systemctl; then
    sudo systemctl enable --now postgresql
  elif have service; then
    sudo service postgresql start
  fi

  # 等待就绪
  local i
  for i in $(seq 1 15); do
    if "$pg_isready_cmd" -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
      info "PostgreSQL 已就绪"
      return 0
    fi
    sleep 1
  done
  err "PostgreSQL 启动超时，请检查 'brew services list' 或 'systemctl status postgresql'"
  exit 1
}

create_db_local() {
  local bin_dir psql_cmd createdb_cmd
  bin_dir="$(pg_bin)"
  psql_cmd="psql"; [ -n "$bin_dir" ] && psql_cmd="$bin_dir/psql"
  createdb_cmd="createdb"; [ -n "$bin_dir" ] && createdb_cmd="$bin_dir/createdb"
  if "$psql_cmd" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -tAc \
       "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" 2>/dev/null | grep -q 1; then
    info "数据库 $PG_DB 已存在"
  else
    step "创建数据库 $PG_DB…"
    "$createdb_cmd" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" "$PG_DB"
  fi
}

install_redis_local() {
  if (have redis-cli && redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping >/dev/null 2>&1); then
    info "Redis 已在运行"
    return 0
  fi
  # 检查端口是否已被占用（如 redislite）
  if lsof -nP -iTCP:6379 -sTCP:LISTEN >/dev/null 2>&1; then
    info "Redis（6379 端口已有服务）"
    return 0
  fi
  step "安装/启动 Redis…"
  if is_macos; then
    brew install redis >/dev/null 2>&1 || true
    brew services start redis >/dev/null 2>&1 || true
  elif have apt-get; then
    sudo apt-get install -y redis-server
    sudo systemctl enable --now redis-server 2>/dev/null || sudo service redis-server start
  else
    warn "无法自动安装 Redis，请手动安装；否则后端启动会失败"
    return 0
  fi
}

# ---------------------------------------------------------------------------
# env 配置
# ---------------------------------------------------------------------------
gen_secret() { openssl rand -hex 32 2>/dev/null || python3 -c "import secrets;print(secrets.token_hex(32))"; }

setup_backend_env() {
  local env_file="$BACKEND_DIR/.env" key
  key="$(read_deepseek_key)"

  if [ ! -f "$env_file" ]; then
    step "创建 backend/.env…"
    cp "$BACKEND_DIR/.env.example" "$env_file"
  fi

  # 用 Python 幂等改写关键字段（保留其余注释/字段）
  python3 - "$env_file" "$key" "$AI_MODEL" "$OPENAI_BASE_URL" "$PG_USER" "$PG_HOST" "$PG_PORT" "$PG_DB" <<'PYEOF'
import re, sys
path, key, model, base_url, pg_user, pg_host, pg_port, pg_db = sys.argv[1:]

with open(path) as f:
    c = f.read()

def set_val(content, name, value):
    # 若字段已存在（非注释行），替换值；否则在文件末尾追加
    pat = re.compile(rf'^{re.escape(name)}=.*$', re.M)
    if pat.search(content):
        return pat.sub(f'{name}={value}', content)
    return content.rstrip() + f'\n{name}={value}\n'

secret = __import__('secrets').token_hex(32)

# 只在 SECRET_KEY 还是占位符/默认时才生成覆盖
if 'SECRET_KEY' not in c or 'change-me' in c:
    c = set_val(c, 'SECRET_KEY', secret)

c = set_val(c, 'POSTGRES_USER', pg_user)
c = set_val(c, 'POSTGRES_HOST', pg_host)
c = set_val(c, 'POSTGRES_PORT', pg_port)
c = set_val(c, 'POSTGRES_DB', pg_db)
c = set_val(c, 'POSTGRES_PASSWORD', '')   # local trust 认证

# Redis 清空密码（redislite / 本机无密码）
c = set_val(c, 'REDIS_HOST', 'localhost')
c = set_val(c, 'REDIS_PORT', '6379')
c = set_val(c, 'REDIS_PASSWORD', '')

# DeepSeek 模型（key 为空则保持空）
if key:
    c = set_val(c, 'OPENAI_API_KEY', key)
c = set_val(c, 'OPENAI_BASE_URL', base_url)
c = set_val(c, 'AI_MODEL', model)

with open(path, 'w') as f:
    f.write(c)

print(f"backend/.env 已就绪（model={model}, base_url={base_url}, key={'已配置' if key else '未配置'}）")
PYEOF
}

setup_frontend_env() {
  local env_file="$FRONTEND_DIR/.env.local"
  if [ ! -f "$env_file" ]; then
    step "创建 frontend/.env.local…"
    cp "$FRONTEND_DIR/.env.example" "$env_file"
  fi
  info "frontend/.env.local 已就绪（默认指向 http://localhost:8000）"
}

# ---------------------------------------------------------------------------
# 迁移
# ---------------------------------------------------------------------------
run_migrations_local() {
  step "应用数据库迁移（alembic）…"
  (cd "$BACKEND_DIR" && uv run alembic upgrade head)
}

seed_admin_local() {
  step "创建 admin 用户（admin@example.com / admin123）…"
  if (cd "$BACKEND_DIR" && uv run ai_agent_test user list 2>/dev/null | grep -q "admin@example.com"); then
    info "admin 已存在，跳过"
  else
    (cd "$BACKEND_DIR" && uv run ai_agent_test user create --email admin@example.com --password admin123 --superuser)
  fi
}

run_migrations_docker() {
  step "应用数据库迁移（docker）…"
  docker compose -f "$COMPOSE_FILE" exec -T app ai_agent_test db upgrade
}

seed_admin_docker() {
  step "创建 admin 用户…"
  if docker compose -f "$COMPOSE_FILE" exec -T app ai_agent_test user list 2>/dev/null | grep -q "admin@example.com"; then
    info "admin 已存在，跳过"
  else
    docker compose -f "$COMPOSE_FILE" exec -T app ai_agent_test user create \
      --email admin@example.com --password admin123 --superuser
  fi
}

# ---------------------------------------------------------------------------
# 启动 / 停止（local）
# ---------------------------------------------------------------------------
start_local() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"

  # 后端：PID 文件活着，或 8000 端口已被占用，都视为已在运行
  if { [ -f "$RUN_DIR/backend.pid" ] && kill -0 "$(cat "$RUN_DIR/backend.pid")" 2>/dev/null; } \
     || lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    info "后端已在运行 (:8000)"
  else
    step "启动后端 uvicorn → :8000…"
    (cd "$BACKEND_DIR" && nohup uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 \
      >"$LOG_DIR/backend.log" 2>&1 & echo $! > "$RUN_DIR/backend.pid")
    info "后端 PID $(cat "$RUN_DIR/backend.pid")，日志 $LOG_DIR/backend.log"
  fi

  # 前端：PID 文件活着，或 3000 端口已被占用，都视为已在运行
  if { [ -f "$RUN_DIR/frontend.pid" ] && kill -0 "$(cat "$RUN_DIR/frontend.pid")" 2>/dev/null; } \
     || lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    info "前端已在运行 (:3000)"
  else
    step "启动前端 next start(生产) → :3000…"
    (cd "$FRONTEND_DIR" && nohup bun start >"$LOG_DIR/frontend.log" 2>&1 & echo $! > "$RUN_DIR/frontend.pid")
    info "前端 PID $(cat "$RUN_DIR/frontend.pid")，日志 $LOG_DIR/frontend.log"
  fi
}

stop_local() {
  local pid
  for f in backend.pid frontend.pid; do
    if [ -f "$RUN_DIR/$f" ]; then
      pid="$(cat "$RUN_DIR/$f")"
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null && info "已停止 $f (PID $pid)"
      fi
      rm -f "$RUN_DIR/$f"
    fi
  done
  # 顺带杀掉可能的孤儿 uvicorn/next（按端口）
  [ -f "$RUN_DIR/backend.pid" ] || lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true
  [ -f "$RUN_DIR/frontend.pid" ] || lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# 启动 / 停止（docker）
# ---------------------------------------------------------------------------
start_docker() {
  step "docker compose build + up（首次会 pull 镜像，较慢）…"
  docker compose -f "$COMPOSE_FILE" up -d --build
  # 等 db 就绪
  local i
  for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1; then
      info "PostgreSQL(容器) 已就绪"
      break
    fi
    sleep 2
  done
  run_migrations_docker
}

stop_docker() {
  docker compose -f "$COMPOSE_FILE" down
}

# ---------------------------------------------------------------------------
# status / logs
# ---------------------------------------------------------------------------
show_status() {
  echo "=== 端口 ==="
  for p in 8000 3000 5432 6379; do
    if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then
      echo "  :$p  $(lsof -nP -iTCP:$p -sTCP:LISTEN | awk 'NR==2{print $1" (PID "$2")"}')"
    else
      echo "  :$p  -"
    fi
  done
  echo "=== 后端健康 ==="
  curl -sS --max-time 3 http://localhost:8000/api/v1/health 2>/dev/null || echo "  (后端未响应)"
  echo ""
  echo "=== 前端 ==="
  curl -sS -o /dev/null -w "  http://localhost:3000 → HTTP %{http_code}\n" --max-time 3 http://localhost:3000/ 2>/dev/null || echo "  (前端未响应)"
}

show_logs() {
  local target="${1:-backend}"
  if [ -f "$LOG_DIR/$target.log" ]; then
    tail -f "$LOG_DIR/$target.log"
  else
    docker compose -f "$COMPOSE_FILE" logs -f "$target" 2>/dev/null || err "无 $target 日志"
  fi
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
setup_local() {
  export_mirrors
  require_cmd curl "请先安装 curl"
  ensure_uv
  ensure_bun
  install_postgres_local
  start_postgres_local
  create_db_local
  install_redis_local
  setup_backend_env
  setup_frontend_env
  step "安装后端依赖（uv sync）…"
  (cd "$BACKEND_DIR" && uv sync)
  step "安装前端依赖（bun install）…"
  (cd "$FRONTEND_DIR" && bun install)
  step "构建前端（bun run build，生产模式）…"
  (cd "$FRONTEND_DIR" && bun run build)
  run_migrations_local
}

setup_docker() {
  export_mirrors
  require_cmd docker "请安装 Docker Desktop / Docker Engine"
  docker info >/dev/null 2>&1 || { err "Docker daemon 未运行，请先启动 Docker"; exit 1; }
  setup_backend_env
  setup_frontend_env
  # docker 模式下 .env 的 host 要指向容器名（db/redis/milvus），由 compose 的 environment 覆盖，
  # 这里不强制改，compose 里已硬编码了 POSTGRES_HOST=db 等。
}

usage() {
  cat <<EOF
用法: ./run.sh [--local] [命令]

模式（可省略命令，默认 setup+start）：
  --local        本地模式（绕过 Docker，自动装 postgres/redis）

命令：
  setup          安装依赖 + 配置 .env + 迁移
  start          启动前后端
  stop           停止前后端
  status         查看状态（端口/健康）
  logs [name]    看日志（local: backend/frontend；docker: 服务名）
  seed           创建 admin@example.com / admin123

示例：
  ./run.sh                  # docker 模式一键起
  ./run.sh --local          # local 模式一键起
  ./run.sh --local status
  NO_CHINA_MIRROR=1 ./run.sh --local   # 用官方源
EOF
}

main() {
  local MODE="docker" CMD="all"

  # 解析参数
  while [ $# -gt 0 ]; do
    case "$1" in
      --local) MODE="local"; shift ;;
      setup|start|stop|status|logs|seed) CMD="$1"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) err "未知参数: $1"; usage; exit 1 ;;
    esac
  done

  # logs 可能带第二个参数（服务名）
  if [ "$CMD" = "logs" ] && [ $# -gt 0 ]; then
    LOG_TARGET="$1"; shift
  else
    LOG_TARGET="backend"
  fi

  if ! is_macos && ! is_linux; then
    err "不支持的平台: $OS（Windows 请用 WSL2 / Git Bash）"
    exit 1
  fi

  info "平台: $OS, 模式: $MODE, 命令: $CMD"

  case "$CMD" in
    all)
      if [ "$MODE" = "local" ]; then
        setup_local && start_local
      else
        setup_docker && start_docker
      fi
      ;;
    setup)
      [ "$MODE" = "local" ] && setup_local || setup_docker
      ;;
    start)
      [ "$MODE" = "local" ] && start_local || start_docker
      ;;
    stop)
      [ "$MODE" = "local" ] && stop_local || stop_docker
      ;;
    status)
      show_status
      ;;
    logs)
      show_logs "$LOG_TARGET"
      ;;
    seed)
      [ "$MODE" = "local" ] && seed_admin_local || seed_admin_docker
      ;;
  esac

  if [ "$CMD" = "all" ] || [ "$CMD" = "start" ]; then
    echo ""
    info "就绪：后端 http://localhost:8000  ·  前端 http://localhost:3000  ·  Docs http://localhost:8000/docs"
  fi
}

main "$@"
