#!/usr/bin/env bash
# Mobility Demo 自动化测试脚本
# 在 tmux 中运行，结果写入日志文件
set -uo pipefail
# NOTE: no -e; test failures must not abort the script

BACKEND_DIR="/home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/backend"
FRONTEND_DIR="/home/KrisAgent/full-stack-ai-agent-template-clean/ai_agent_test/frontend"
LOG="/home/KrisAgent/full-stack-ai-agent-template-clean/docs/test-results.md"
VENV="$BACKEND_DIR/.venv/bin/python"
PIP="$BACKEND_DIR/.venv/bin/pip"
PYTEST="$BACKEND_DIR/.venv/bin/pytest"
RUFF="$BACKEND_DIR/.venv/bin/ruff"

PASS=0
FAIL=0
SKIP=0

# ========== 工具函数 ==========
header() { echo -e "\n## $1\n" >> "$LOG"; }
section() { echo -e "\n### $1" >> "$LOG"; }
result() {
  local status="$1" label="$2" detail="${3:-}"
  if [ "$status" = "PASS" ]; then
    echo "- ✅ **$label**" >> "$LOG"
    PASS=$((PASS+1))
  elif [ "$status" = "FAIL" ]; then
    echo "- ❌ **$label**: $detail" >> "$LOG"
    FAIL=$((FAIL+1))
  else
    echo "- ⏭️ **$label**: $detail" >> "$LOG"
    SKIP=$((SKIP+1))
  fi
  [ -n "$detail" ] && echo "  > $detail" >> "$LOG"
}

# ========== 初始化日志 ==========
cat > "$LOG" << 'HEADER'
# 测试结果：Mobility Demo 自动化验证

> 自动生成于 $(date '+%Y-%m-%d %H:%M:%S')

HEADER

echo "========================================"
echo "  Mobility Demo 自动化测试"
echo "========================================"
echo "日志文件: $LOG"
echo ""

# ==========================================
# T1: 代码质量检查
# ==========================================
header "T1：代码质量检查（静态）"

echo "▶ T1: 代码质量检查..."

cd "$BACKEND_DIR"

# ruff check
section "ruff check"
if $RUFF check . > /tmp/ruff-check.txt 2>&1; then
  result "PASS" "ruff check" "$(wc -l < /tmp/ruff-check.txt) warnings"
else
  result "FAIL" "ruff check" "$(cat /tmp/ruff-check.txt | head -20)"
fi

# ruff format
section "ruff format --check"
if $RUFF format --check . > /tmp/ruff-fmt.txt 2>&1; then
  result "PASS" "ruff format --check" "All files formatted correctly"
else
  result "FAIL" "ruff format --check" "$(cat /tmp/ruff-fmt.txt | head -20)"
fi

# py_compile 新增文件
section "py_compile（新增文件）"
NEW_FILES=(
  "app/commands/seed_mobility_kb.py"
  "app/commands/seed_prompts.py"
  "app/commands/seed_mobility.py"
  "app/agents/mcp_servers/pg_query_server.py"
  "app/agents/mcp_servers/chart_server.py"
  "app/db/models/mobility.py"
  "alembic/versions/0021_create_mobility_tables.py"
)
for f in "${NEW_FILES[@]}"; do
  if [ -f "$f" ]; then
    if $VENV -m py_compile "$f" 2>/dev/null; then
      result "PASS" "py_compile $f"
    else
      result "FAIL" "py_compile $f" "编译失败"
    fi
  else
    result "SKIP" "py_compile $f" "文件不存在"
  fi
done

echo "  T1 完成: PASS=$PASS FAIL=$FAIL"

# ==========================================
# T2: 模块导入测试
# ==========================================
header "T2：模块导入测试"

echo "▶ T2: 模块导入测试..."

IMPORT_MODULES=(
  "app.commands.seed_mobility:seed_mobility"
  "app.commands.seed_prompts:seed_prompts"
  "app.commands.seed_mobility_kb:seed_mobility_kb"
  "app.agents.mcp_servers.pg_query_server:mcp"
  "app.agents.mcp_servers.chart_server:mcp as chart_mcp"
  "app.db.models.mobility:Station"
  "app.commands.rag:get_rag_services"
)

for item in "${IMPORT_MODULES[@]}"; do
  mod="${item%%:*}"
  sym="${item##*:}"
  if $VENV -c "from $mod import $sym; print('OK')" > /tmp/import-test.txt 2>&1; then
    result "PASS" "import ${mod}.${sym%% *}"
  else
    result "FAIL" "import ${mod}.${sym%% *}" "$(cat /tmp/import-test.txt | tail -3)"
  fi
done

echo "  T2 完成"

# ==========================================
# T3: 单元测试
# ==========================================
header "T3：已有单元测试"

echo "▶ T3: 运行 pytest..."

cd "$BACKEND_DIR"
section "pytest（全部）"
# Note: migrations test needs a separate DB, skip it to avoid breaking dev DB
if $PYTEST tests/ -v --timeout=60 -x --ignore=tests/test_migrations.py > /tmp/pytest-out.txt 2>&1; then
  PASS_COUNT=$(grep -c "PASSED" /tmp/pytest-out.txt || echo 0)
  result "PASS" "pytest" "${PASS_COUNT} tests passed"
  echo '```' >> "$LOG"
  grep -E "PASSED|FAILED|ERROR|test session starts|passed|failed" /tmp/pytest-out.txt >> "$LOG"
  echo '```' >> "$LOG"
else
  FAIL_COUNT=$(grep -c "FAILED" /tmp/pytest-out.txt || echo 0)
  ERROR_COUNT=$(grep -c "ERROR" /tmp/pytest-out.txt || echo 0)
  result "FAIL" "pytest" "${FAIL_COUNT} failed, ${ERROR_COUNT} errors"
  echo '```' >> "$LOG"
  grep -E "PASSED|FAILED|ERROR|test session starts|passed|failed|errors" /tmp/pytest-out.txt >> "$LOG"
  echo '```' >> "$LOG"
fi

echo "  T3 完成"

# ==========================================
# T4: MCP Server 逻辑验证
# ==========================================
header "T4：MCP Server 逻辑验证"

echo "▶ T4: pg_query_server 逻辑测试..."

$VENV << 'PYEOF' >> "$LOG" 2>&1
import json

from app.agents.mcp_servers.pg_query_server import _validate_sql

tests = [
    # (desc, sql, expect_pass, check_detail)
    ("正常 SELECT", "SELECT * FROM stations", True, "LIMIT 500 追加"),
    ("CTE 内层 LIMIT", "WITH latest AS (SELECT * FROM vehicle_distribution LIMIT 10) SELECT * FROM latest", True, "外层追加 LIMIT 500"),
    ("AS merge 别名", "SELECT s.name AS merge FROM stations s", True, "merge 别名不被拦截"),
    ("CTE 名当表引用", "WITH cte AS (SELECT 1) SELECT * FROM cte", True, "cte 名不被判为非白名单表"),
    ("INSERT 拒绝", "INSERT INTO stations VALUES (1)", False, "INSERT 被拒绝"),
    ("DELETE 拒绝", "DELETE FROM stations", False, "DELETE 被拒绝"),
    ("DROP 拒绝", "DROP TABLE stations", False, "DROP 被拒绝"),
    ("非白名单表", "SELECT * FROM users", False, "非白名单表被拒绝"),
    ("多语句分号", "SELECT 1; SELECT 2", False, "多语句被拒绝"),
    ("已有 LIMIT", "SELECT * FROM stations LIMIT 10", True, "不重复追加 LIMIT"),
    ("UPDATE 拒绝", "UPDATE stations SET name='x'", False, "UPDATE 被拒绝"),
    ("子查询非白名单", "SELECT * FROM (SELECT * FROM users) t", False, "子查询非白名单表被拒绝"),
]

print("| # | 场景 | 预期 | 实际 | 结果 |")
print("|---|------|------|------|------|")
for i, (desc, sql, expect_pass, detail) in enumerate(tests, 1):
    try:
        result_sql = _validate_sql(sql)
        actual_pass = True
        has_limit = "LIMIT 500" in result_sql if expect_pass else None
        note = ""
        if expect_pass and "LIMIT" not in result_sql:
            note = "（无 LIMIT）"
        elif expect_pass and "LIMIT 500" in result_sql:
            note = "✓ LIMIT 500 追加"
        elif expect_pass:
            note = "（有 LIMIT 但非 500）"
        print(f"| {i} | {desc} | {'通过' if expect_pass else '拒绝'} | 通过 | {'✅' if expect_pass else '❌ 误放行'} {note} |")
    except ValueError as e:
        actual_pass = False
        print(f"| {i} | {desc} | {'通过' if expect_pass else '拒绝'} | 拒绝 | {'❌ 误拦截' if expect_pass else '✅'} {detail} |")
PYEOF

echo "  T4 完成"

# ==========================================
# T5: 种子命令 dry-run
# ==========================================
header "T5：种子命令注册验证"

echo "▶ T5: 种子命令 dry-run..."

cd "$BACKEND_DIR"

for cmd_name in "seed-mobility" "seed-prompts" "seed-mobility-kb"; do
  if $VENV -m ai_agent_test cmd "$cmd_name" --help > /tmp/cmd-help.txt 2>&1; then
    result "PASS" "$cmd_name --help" "命令已注册"
  else
    result "FAIL" "$cmd_name --help" "$(cat /tmp/cmd-help.txt | tail -3)"
  fi
done

echo "  T5 完成"

# ==========================================
# T6: 数据库连通性
# ==========================================
header "T6：数据库连通性与数据验证"

echo "▶ T6: 数据库检查..."

section "PostgreSQL 连通性 + Mobility 数据量"
docker exec ai_agent_test_db psql -U postgres -d ai_agent_test -c "
SELECT
  (SELECT COUNT(*) FROM stations) as stations,
  (SELECT COUNT(*) FROM vehicle_distribution) as vehicle_distribution,
  (SELECT COUNT(*) FROM orders) as orders,
  (SELECT COUNT(*) FROM weather) as weather,
  (SELECT COUNT(*) FROM demand_forecast) as demand_forecast;
" > /tmp/db-check.txt 2>&1

if [ $? -eq 0 ]; then
  result "PASS" "数据库连通性"
  echo '```' >> "$LOG"
  cat /tmp/db-check.txt >> "$LOG"
  echo '```' >> "$LOG"
else
  result "FAIL" "数据库连通性" "$(cat /tmp/db-check.txt)"
fi

section "Prompt 模板状态"
docker exec ai_agent_test_db psql -U postgres -d ai_agent_test -c "
SELECT name, is_active FROM prompt_templates ORDER BY name;
" > /tmp/prompt-check.txt 2>&1

if [ $? -eq 0 ]; then
  result "PASS" "Prompt 模板查询"
  echo '```' >> "$LOG"
  cat /tmp/prompt-check.txt >> "$LOG"
  echo '```' >> "$LOG"
else
  result "FAIL" "Prompt 模板查询" "$(cat /tmp/prompt-check.txt)"
fi

section "Knowledge Bases 状态"
docker exec ai_agent_test_db psql -U postgres -d ai_agent_test -c "
SELECT name, collection_name, scope FROM knowledge_bases;
" > /tmp/kb-check.txt 2>&1

if [ $? -eq 0 ]; then
  result "PASS" "Knowledge Bases 查询"
  echo '```' >> "$LOG"
  cat /tmp/kb-check.txt >> "$LOG"
  echo '```' >> "$LOG"
else
  result "FAIL" "Knowledge Bases 查询" "$(cat /tmp/kb-check.txt)"
fi

echo "  T6 完成"

# ==========================================
# T7: Milvus 连通性
# ==========================================
header "T7：Milvus 连通性"

echo "▶ T7: Milvus 检查..."

cd "$BACKEND_DIR"
$VENV << 'PYEOF' >> "$LOG" 2>&1
try:
    from pymilvus import MilvusClient
    client = MilvusClient(uri="http://localhost:19530", token="root:Milvus")
    collections = client.list_collections()
    print(f"- ✅ **Milvus 连通**: OK")
    print(f"  > 现有 collections: {collections if collections else '（空）'}")
except Exception as e:
    print(f"- ❌ **Milvus 连通**: {e}")
PYEOF

echo "  T7 完成"

# ==========================================
# T8: 前端检查
# ==========================================
header "T8：前端编译检查"

echo "▶ T8: 前端检查..."

cd "$FRONTEND_DIR"

section "package.json echarts 依赖"
if grep -q '"echarts"' package.json 2>/dev/null; then
  result "PASS" "echarts 依赖" "已在 package.json 中"
else
  result "FAIL" "echarts 依赖" "未在 package.json 中找到"
fi

section "新增前端文件存在性"
NEW_FE_FILES=(
  "src/components/chat/echart-message.tsx"
  "src/components/chat/pg-query-result.tsx"
  "src/types/chat.ts"
)
for f in "${NEW_FE_FILES[@]}"; do
  if [ -f "$f" ]; then
    result "PASS" "$f 存在"
  else
    result "FAIL" "$f 存在" "文件不存在"
  fi
done

section "TypeScript 编译检查"
if command -v npx &>/dev/null; then
  if npx tsc --noEmit --pretty 2>/tmp/tsc-out.txt 1>/dev/null; then
    result "PASS" "TypeScript 编译" "无类型错误"
  else
    ERR_COUNT=$(wc -l < /tmp/tsc-out.txt)
    result "FAIL" "TypeScript 编译" "${ERR_COUNT} 行错误输出"
    echo '```' >> "$LOG"
    head -30 /tmp/tsc-out.txt >> "$LOG"
    echo '```' >> "$LOG"
  fi
else
  result "SKIP" "TypeScript 编译" "npx/tsc 不可用"
fi

echo "  T8 完成"

# ==========================================
# 汇总
# ==========================================
header "测试汇总"

# 重新计算（因为 result 函数里的计数器在子 shell 中可能不准）
echo "" >> "$LOG"
echo "| 指标 | 值 |" >> "$LOG"
echo "|------|----|" >> "$LOG"
echo "| ✅ 通过 | 见上方详情 |" >> "$LOG"
echo "| ❌ 失败 | 见上方详情 |" >> "$LOG"
echo "| ⏭️ 跳过 | 见上方详情 |" >> "$LOG"
echo "| 测试时间 | $(date '+%Y-%m-%d %H:%M:%S') |" >> "$LOG"

echo ""
echo "========================================"
echo "  测试完成！"
echo "========================================"
echo "  日志文件: $LOG"
echo ""
echo "  下一步："
echo "  1. 查看 $LOG 了解详细结果"
echo "  2. 如全部通过，执行 seed-mobility-kb 做真实入库"
echo "  3. 进入 Phase 5 手动集成验证"
echo ""
