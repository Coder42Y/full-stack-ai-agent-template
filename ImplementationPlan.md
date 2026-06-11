---
type: implementation-plan
source: PRD-业务版.md, UserStories.md
created: 2026-06-10
status: draft
target: ai_agent_test/ (已生成样例项目，非 Cookiecutter template)
---

# 实现计划：共享出行运营数据分析 Agent Demo

## 1. 背景与目标

在现有 `ai_agent_test/` 全栈骨架上构建**共享出行运营数据分析 Agent Demo**，目标是面试展示。通过 NL2SQL + MCP 可插拔工具 + ECharts 图表 + RAG 知识库，让运营人员用自然语言完成数据查询、趋势分析、异常检测和应急决策。

### 核心思路

不做新框架，只在三个"接缝"注入业务能力：

1. **两个新 MCP Server**（pg_query + echarts）—— 利用现有 MCP 自动发现机制，零额外接线
2. **一张 Alembic 迁移**（5 张业务表）+ 种子数据命令
3. **前端两个新渲染器**（ECharts 图表 + SQL/数据面板）

### MVP 范围

**P0 用户故事：**
- US-01 按区域查询聚合指标
- US-02 实时查询车辆分布与缺口
- US-04 按条件查询车辆堆积
- US-14 创建和激活 Prompt 模板

**P1 用户故事（Demo 说服力）：**
- US-06 早晚高峰用车趋势图（ECharts）
- US-12 运营知识检索（RAG）

### 已锁定决策

| 决策 | 结论 |
|------|------|
| 改哪里 | 只改 `ai_agent_test/`，不动 Cookiecutter template |
| 数据表 | 5 张：stations, vehicle_distribution, orders, weather, demand_forecast |
| 地名 | 真实上海地点，18 个投放点 |
| "实时" | 种子数据最新时间戳模拟，不做定时刷新 |
| NL2SQL 展示 | 所有查询展示 SQL，可折叠调试区 |
| SQL 安全 | 只读 SELECT、表白名单、10s 超时、500 行上限 |
| Prompt 模板 | 全局（NULL organization_id），数据模型预留字段 |
| 图表 | ECharts MCP Server，前端加 echarts 依赖 |

---

## 2. 现有代码复用清单

以下能力已存在，**不重写**，直接复用：

| 能力 | 来源文件 | 用途 |
|------|---------|------|
| MCP 自动发现与注册 | `agents/mcp_tool.py` → `discover_mcp_tools()` + `register_cached_mcp_tools()` | 新 MCP Server 零额外接线 |
| MCP client 生命周期 | `agents/mcp_client.py` → `MCPClientManager` | 连接/断开/调用统一管理 |
| Prompt 模板 CRUD + 激活 | `services/prompt_template.py` → `PromptTemplateService` | 创建/激活/变量替换 `{{date}}` `{{time}}` `{{datetime}}` |
| RAG 检索 | `agents/tools/rag_tool.py` → `search_knowledge_base()` | 运营手册检索 |
| WebSocket 流式输出 | `services/agent_session.py` | tool_call / tool_result / text_delta 事件流 |
| 前端 tool 结果分发 | `components/chat/tool-call-card.tsx` | 按 tool name 路由到专用渲染器 |
| CLI 命令自发现 | `commands/__init__.py` → `@command()` 装饰器 | 种子命令自动注册 |
| MCP Server 参考实现 | `agents/mcp_servers/web_search_server.py` | FastMCP 模式模板 |
| Auth / 组织 / 权限 | 全套已有 | 不做改动 |

### MCP Server 创建配方（从 web_search_server 提炼）

```python
# 1. 创建文件 app/agents/mcp_servers/my_server.py
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("my-server")

@mcp.tool()
def my_tool(param: str) -> str:
    """LLM 可见的工具描述"""
    return json.dumps({"kind": "my_tool", ...})

if __name__ == "__main__":
    mcp.run()  # stdio transport

# 2. 在 config.py 的 MCP_SERVERS dict 添加配置
# 3. 如需 env var，在 main.py lifespan 注入
# 4. .env 设 MCP_ENABLED=true
# → 完成。mcp_client.py 自动连接，mcp_tool.py 自动发现，assistant.py 自动注册
```

---

## 3. Phase 分解

### Phase 0：数据库 Schema + 种子数据

> **依赖**：无 | **工时**：3-4h

#### 新建文件

**`backend/app/db/models/mobility.py`** — 5 个 SQLAlchemy 模型

| 模型 | 关键字段 | 索引 |
|------|---------|------|
| `Station` | id(UUID PK), name(100), district(50), address(255), lat, lng, capacity(int), station_type(20: metro/commercial/residential/industrial/park) | — |
| `VehicleDistribution` | id, station_id(FK→stations CASCADE), bike_count(int), ebike_count(int), scooter_count(int), total_count(int), recorded_at(datetime+tz) | `(station_id, recorded_at)` 联合索引 |
| `Order` | id, user_id(str 50), vehicle_type(str 20: bike/ebike/scooter), pickup_station_id(FK), dropoff_station_id(FK), amount(float), duration_minutes(int), created_at(datetime+tz) | `created_at`, `(pickup_station_id, created_at)` |
| `Weather` | id, station_id(FK), date(date), weather_type(str 20: sunny/cloudy/rainy/heavy_rain/snow), temperature(float), precipitation_mm(float), wind_speed(float) | `uq(station_id, date)` 唯一约束 |
| `DemandForecast` | id, station_id(FK), forecast_date(date), hour(int 0-23), predicted_demand(int), confidence(float), model_version(str 20) | `(station_id, forecast_date, hour)` 联合索引 |

编码规范：`Base + TimestampMixin`、`Mapped[type]` + `mapped_column()`、`UUID PK` + `uuid.uuid4`、`ondelete="CASCADE"`、`__repr__` 必写。

**`backend/alembic/versions/0021_create_mobility_tables.py`** — 迁移

```
revision = "0021_create_mobility_tables"
down_revision = "0020_add_prompt_active_unique"
```

- `upgrade()` 按依赖序：stations → vehicle_distribution → orders → weather → demand_forecast
- `downgrade()` 反序 drop（先 demand_forecast，最后 stations）

**`backend/app/commands/seed_mobility.py`** — 种子 CLI 命令

```bash
uv run ai_agent_test cmd seed-mobility --clear --days 30
```

18 个上海真实投放点（硬编码，非随机生成）：

| 投放点 | 区域 | 类型 | 大致坐标 |
|--------|------|------|---------|
| 张江地铁站 | 浦东新区 | metro | 31.204, 121.590 |
| 徐家汇商圈 | 徐汇区 | commercial | 31.196, 121.436 |
| 陆家嘴 | 浦东新区 | commercial | 31.240, 121.500 |
| 虹桥火车站 | 闵行区 | metro | 31.195, 121.320 |
| 人民广场 | 黄浦区 | metro | 31.232, 121.475 |
| 静安寺 | 静安区 | commercial | 31.224, 121.448 |
| 漕河泾开发区 | 徐汇区 | industrial | 31.175, 121.410 |
| 紫竹高新区 | 闵行区 | industrial | 31.020, 121.440 |
| 南京东路步行街 | 黄浦区 | commercial | 31.238, 121.480 |
| 中山公园 | 长宁区 | park | 31.224, 121.416 |
| 世纪大道 | 浦东新区 | metro | 31.226, 121.530 |
| 嘉定新城 | 嘉定区 | residential | 31.380, 121.260 |
| 松江大学城 | 松江区 | residential | 31.060, 121.230 |
| 浦东国际机场 | 浦东新区 | metro | 31.144, 121.808 |
| 五角场 | 杨浦区 | commercial | 31.300, 121.515 |
| 龙阳路交通枢纽 | 浦东新区 | metro | 31.210, 121.560 |
| 上海火车站 | 静安区 | metro | 31.249, 121.456 |
| 虹口足球场 | 虹口区 | metro | 31.265, 121.480 |

数据生成逻辑：

| 数据集 | 数量 | 生成方式 |
|--------|------|---------|
| stations | 18 行 | 硬编码常量列表 |
| orders | ~2000 行 | 30天 × `random.triangular` 双峰分布（早8-9/晚17-19 权重×3），车型 bike:ebike:scooter = 5:3:2，金额 `gauss(6, 3)` |
| vehicle_distribution | ~432 行 | 18站 × 24小时，早晚高峰 drain + 凌晨 recharge 模式 |
| weather | ~126 行 | 18站 × 7天，2天 rainy/heavy_rain，其余 sunny/cloudy |
| demand_forecast | ~3024 行 | 18站 × 7天 × 24小时，预计算 demand，confidence 0.7-0.95 |

#### 修改文件

- **`backend/app/db/models/__init__.py`** — import + `__all__` 添加 `Station, VehicleDistribution, Order, Weather, DemandForecast`
- **`backend/alembic/env.py`** — 添加 `from app.db.models.mobility import Station, VehicleDistribution, Order, Weather, DemandForecast`

#### 验证方法

```bash
cd backend
uv run alembic upgrade head
uv run ai_agent_test cmd seed-mobility --clear
# psql -h localhost -p 15432 -U postgres -d ai_agent_test -c "SELECT count(*) FROM stations;"
# psql -h localhost -p 15432 -U postgres -d ai_agent_test -c "SELECT count(*) FROM orders;"
uv run alembic downgrade 0020  # 验证回滚
uv run alembic upgrade head     # 恢复
```

---

### Phase 1：后端 MCP Server（pg_query + echarts）

> **依赖**：Phase 0 | **工时**：5-6h

#### 新建文件

**`backend/app/agents/mcp_servers/pg_query_server.py`** — NL2SQL MCP Server

```python
mcp = FastMCP("pg-query")

@mcp.tool()
def execute_query(sql: str) -> str:
    """Execute a read-only SQL query against the shared mobility database.

    The database contains Shanghai shared mobility operational data:
    - stations: bike/scooter docking stations with location and capacity
    - vehicle_distribution: hourly vehicle counts per station
    - orders: ride orders with pickup/dropoff stations and amounts
    - weather: daily weather data per station
    - demand_forecast: predicted demand per station/hour

    Args:
        sql: A valid SELECT query. Only read-only queries are allowed.
             Tables: stations, vehicle_distribution, orders, weather, demand_forecast.

    Returns:
        JSON string: {"kind": "pg_query", "sql": "...", "data": [...],
                      "columns": [...], "row_count": N, "truncated": false}
    """
```

核心实现要点：

- **DB 连接**：从环境变量 `DATABASE_URL` 读，同步 `psycopg2`（已在 pyproject.toml 依赖中），模块级 `connection` + `autocommit=True`
- **SQL 安全层** `_validate_sql(sql) -> str`：
  1. 去首尾空白和分号
  2. 首关键字必须是 `SELECT` 或 `WITH`，否则拒绝
  3. 全文扫描禁止：`DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|EXECUTE|GRANT`（大小写不敏感）
  4. 表引用白名单：`stations|vehicle_distribution|orders|weather|demand_forecast`（正则提取表名校验）
  5. 无 `LIMIT` 子句则追加 `LIMIT 500`
  6. 每条查询前 `SET LOCAL statement_timeout = '10s'`
- **返回格式**：`{kind: "pg_query", sql, data: [{col: val, ...}], columns: [str], row_count: int, truncated: bool}`
- **错误格式**：`{kind: "pg_query_error", sql, error: "psycopg2 error message"}`
- **连接失败**：启动时检测 `DATABASE_URL` 是否可连接，不可连接则 `mcp.run()` 仍然启动但所有查询返回错误

**`backend/app/agents/mcp_servers/chart_server.py`** — ECharts MCP Server

```python
mcp = FastMCP("echarts")

@mcp.tool()
def create_echart(
    chart_type: str,
    title: str,
    data: str,
    x_field: str = "",
    y_fields: str = "[]",
) -> str:
    """Generate an ECharts option JSON for interactive data visualization.

    Args:
        chart_type: Chart type - "line", "bar", "pie", "heatmap", or "scatter".
        title: Chart title displayed at the top.
        data: JSON string of data array (e.g., from execute_query results).
        x_field: Field name for X-axis (category/name field).
        y_fields: JSON array of field names for Y-axis values (e.g., '["count","amount"]').

    Returns:
        JSON string: {"kind": "echart", "option": {full ECharts option object}}
    """
```

核心实现要点：

- **不依赖 LLM 生成 ECharts JSON**（避免格式错误），tool 内部用 Python dict builder 按 chart_type 拼装完整 option
- 支持 5 种图表：`line`（折线）、`bar`（柱状）、`pie`（饼图）、`heatmap`（热力图）、`scatter`（散点图）
- `data` 参数是 JSON 字符串，内部 `json.loads` 解析为 `list[dict]`
- 每个 chart_type 对应一个 builder 函数：`_build_line_option(title, data, x_field, y_fields)` 等
- 中文 locale 默认，配色蓝白绿系
- 输入校验：data 为空或非合法 JSON 时返回 `{kind: "echart_error", error: "..."}`

#### 修改文件

**`backend/app/core/config.py`** — MCP_SERVERS dict 添加两个 server（第 168-176 行区域）：

```python
MCP_SERVERS: dict[str, dict] = {
    "web_search": {
        "command": "python",
        "args": ["-m", "app.agents.mcp_servers.web_search_server"],
        "env": {"TAVILY_API_KEY": ""},
    },
    "pg_query": {
        "command": "python",
        "args": ["-m", "app.agents.mcp_servers.pg_query_server"],
        "env": {"DATABASE_URL": ""},  # 从 lifespan 注入
    },
    "echarts": {
        "command": "python",
        "args": ["-m", "app.agents.mcp_servers.chart_server"],
        "env": {},
    },
}
```

**`backend/app/main.py`** — lifespan 中 DATABASE_URL 注入（第 76-78 行循环内添加）：

```python
for _sname, _sconf in server_configs.items():
    if "env" in _sconf:
        _sconf["env"]["TAVILY_API_KEY"] = settings.TAVILY_API_KEY
        # 新增：注入 DATABASE_URL（去掉 +asyncpg 后缀，因为 MCP server 用同步 psycopg2）
        if "DATABASE_URL" in _sconf["env"]:
            _sconf["env"]["DATABASE_URL"] = settings.DATABASE_URL.replace("+asyncpg", "")
```

#### 验证方法

```bash
# 1. 单独测试 MCP server 启动
cd backend && DATABASE_URL="postgresql://postgres:postgres@localhost:15432/ai_agent_test" \
  python -m app.agents.mcp_servers.pg_query_server
# Ctrl+C 退出，确认无 import 错误

# 2. 同样测试 echarts server
cd backend && python -m app.agents.mcp_servers.chart_server

# 3. 全量启动
MCP_ENABLED=true uv run uvicorn app.main:app --reload
# 检查日志输出：MCP tools discovered: [...mcp_execute_query, mcp_create_echart...]
```

---

### Phase 2：前端 ECharts 渲染器 + SQL 面板

> **依赖**：无（可与 Phase 1 并行）| **工时**：4-5h

#### 新建文件

**`frontend/src/components/chat/echart-message.tsx`** — ECharts 渲染组件

结构：
```typescript
// 解析函数
export function parseEChartResult(result: unknown): EChartPayload | null

// 渲染组件
export const EChartMessage = memo(function EChartMessage(
  { payload }: { payload: EChartPayload }
) {
  const chartRef = useRef<HTMLDivElement>(null)
  // useEffect: 初始化 echarts 实例，设置 option
  // useEffect: ResizeObserver 自适应宽度
  // cleanup: dispose echarts 实例
})
```

关键实现：
- **Tree-shaking 导入**（控制打包体积）：
  ```typescript
  import * as echarts from "echarts/core"
  import { BarChart, LineChart, PieChart, HeatmapChart, ScatterChart } from "echarts/charts"
  import { CanvasRenderer } from "echarts/renderers"
  import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from "echarts/components"
  echarts.use([BarChart, LineChart, PieChart, HeatmapChart, ScatterChart, CanvasRenderer, GridComponent, TooltipComponent, TitleComponent, LegendComponent])
  ```
- 高度 400px，宽度 100%，`ResizeObserver` 监听容器变化
- `React.memo` 包裹（与 `chart-message.tsx` 同模式，防 streaming 无限重渲染）
- 卸载时 `dispose()` 释放资源

**`frontend/src/components/chat/pg-query-result.tsx`** — SQL 面板 + 数据表

结构：
```typescript
// 解析函数
export function parsePgQueryResult(result: unknown): PgQueryPayload | null

// 渲染组件
export function PgQueryResult({ payload }: { payload: PgQueryPayload }) {
  const [sqlExpanded, setSqlExpanded] = useState(false)
  // SQL 折叠面板
  // 数据表格（HTML table，斑马纹，max-h-300 + overflow-auto）
  // 底部摘要
}
```

关键实现：
- SQL 区域：灰色 `<pre>` 代码块 + 等宽字体，默认折叠，`ChevronDown`/`ChevronUp` 切换
- 数据表格：`<table>` with `bg-muted/50` 斑马纹，列名从 `payload.columns` 读取，`max-h-[300px] overflow-auto`
- 摘要行：数据库图标 + "查询返回 N 行" + truncated 时显示 "（已截断至 500 行）"

#### 修改文件

**`frontend/package.json`** — 添加依赖：
```json
"echarts": "^5.5.0"
```
（不需要 `echarts-for-react`，直接用 `echarts/core` + `useRef` 更轻量可控）

**`frontend/src/types/chat.ts`** — 添加类型定义：

```typescript
export interface EChartPayload {
  kind: "echart";
  option: Record<string, unknown>;
}

export interface PgQueryPayload {
  kind: "pg_query";
  sql: string;
  data: Record<string, unknown>[];
  columns: string[];
  row_count: number;
  truncated: boolean;
}
```

**`frontend/src/components/chat/tool-call-card.tsx`** — 路由新渲染器（这是关键修改）

4 处改动：

1. **Import**（文件顶部）：
```typescript
import { EChartMessage, parseEChartResult } from "./echart-message";
import { PgQueryResult, parsePgQueryResult } from "./pg-query-result";
```

2. **检测逻辑**（`ToolCallCard` 组件体，~第 479-510 行区域，已有 isDateTime/isRAGSearch/isWebSearch/isChart 之后）：
```typescript
const echartPayload = useMemo(
  () => toolCall.name === "mcp_create_echart" && toolCall.status === "completed"
    ? parseEChartResult(toolCall.result) : null,
  [toolCall.name, toolCall.status, toolCall.result],
);
const isEChart = echartPayload !== null;

const pgQueryPayload = useMemo(
  () => toolCall.name === "mcp_execute_query" && toolCall.status === "completed"
    ? parsePgQueryResult(toolCall.result) : null,
  [toolCall.name, toolCall.status, toolCall.result],
);
const isPgQuery = pgQueryPayload !== null;
```

3. **`hasSpecialRenderer` / `friendlyName` / `ToolIcon` 更新**：
```typescript
const hasSpecialRenderer = isDateTime || isRAGSearch || isWebSearch || isChart || isEChart || isPgQuery;
// friendlyName 添加：
//   "mcp_create_echart": "图表生成"
//   "mcp_execute_query": "数据查询"
// ToolIcon 添加对应图标
```

4. **JSX 渲染分支**（在 `GenericToolResult` fallback 之前添加）：
```tsx
: toolCall.status === "completed" && isEChart && echartPayload ? (
  <EChartMessage payload={echartPayload} />
) : toolCall.status === "completed" && isPgQuery && pgQueryPayload ? (
  <PgQueryResult payload={pgQueryPayload} />
)
```

5. **自动展开**：ECharts 和 pg_query 工具结果默认展开（与 chart 同逻辑）

#### 验证方法

```bash
cd frontend
bun add echarts
bun run type-check    # TypeScript 编译通过
bun run lint          # ESLint 无新增错误
bun dev               # 浏览器验证
```

---

### Phase 3：业务 System Prompt + Prompt 模板

> **依赖**：Phase 1（prompt 引用 MCP tool 名称）| **工时**：2-3h

#### 新建文件

**`backend/app/commands/seed_prompts.py`** — Prompt 模板种子命令

```bash
uv run ai_agent_test cmd seed-prompts
```

创建 3 个 PromptTemplate（category = `system`，`is_active` 默认只激活"分析模式"）：

**模板 1：巡检模式**

```
你是共享出行运营智能助手，服务上海地区共享单车/助力车运营团队。
当前时间：{{datetime}}

## 可用工具
- mcp_execute_query(sql): 查询运营数据库（只读 SELECT）。返回 {kind:"pg_query", sql, data, columns, row_count}。
- mcp_create_echart(chart_type, title, data, x_field, y_fields): 生成 ECharts 图表。chart_type: line/bar/pie/heatmap/scatter。
- search_documents(query): 搜索运营知识库（运营手册、调度策略、应急预案）。

## 数据库 Schema
| 表 | 字段 |
|---|---|
| stations | id, name, district, address, lat, lng, capacity, station_type(metro/commercial/residential/industrial/park) |
| vehicle_distribution | station_id, bike_count, ebike_count, scooter_count, total_count, recorded_at |
| orders | id, user_id, vehicle_type(bike/ebike/scooter), pickup_station_id, dropoff_station_id, amount, duration_minutes, created_at |
| weather | station_id, date, weather_type(sunny/cloudy/rainy/heavy_rain/snow), temperature, precipitation_mm, wind_speed |
| demand_forecast | station_id, forecast_date, hour(0-23), predicted_demand, confidence, model_version |

## SQL 生成规则
- 只生成 SELECT 查询，禁止写操作
- 获取区域名称：JOIN stations s ON xxx.station_id = s.id
- 时间聚合：date_trunc('hour', created_at) 或 date_trunc('day', created_at)
- 缺口计算：df.predicted_demand - vd.total_count AS gap
- 排名用 ROW_NUMBER() 或 ORDER BY ... DESC LIMIT N
- 车辆堆积：total_count > 50 AND recorded_at < NOW() - INTERVAL '24 hours'

## 回答格式（巡检模式）
用简洁 bullet 汇报：
- 当前概况（2-3 个关键数字）
- 异常项（如有，标注 ⚠️）
- 建议操作（按优先级排序，1-3 条）
每次查询都调用 mcp_execute_query，展示 SQL 和结果。
```

**模板 2：分析模式**（默认激活）

在巡检模式基础上增加：
- 回答格式要求：数据表格 + ECharts 图表 + 同比环比对比 + 趋势解读文字
- 主动建议生成图表（"当数据有趋势/对比/分布特征时，主动调用 mcp_create_echart 生成图表"）

**模板 3：应急模式**

在巡检模式基础上改为：
- 回答格式：按紧急程度排序的 checklist（🔴 立即处理 → 🟡 提前准备 → 🟢 持续关注）
- 每条包含：待办事项、对应区域、实时数据、具体操作步骤
- 自动查询 weather 表判断当前天气状况

**`backend/alembic/versions/0022_seed_mobility_prompts.py`** — 迁移

```python
revision = "0022_seed_mobility_prompts"
down_revision = "0021_create_mobility_tables"

def upgrade() -> None:
    # 停用已有默认模板
    op.execute("UPDATE prompt_templates SET is_active = false WHERE is_active = true")
    # 插入 3 个模板（is_active 只设"分析模式"）
    op.execute("""
        INSERT INTO prompt_templates (id, name, description, content, variables, is_active, category, created_by, created_at, updated_at)
        VALUES
          (gen_random_uuid(), '巡检模式', '简洁 bullet 格式，适合日常快速巡检', $content1, '["datetime"]', false, 'system', NULL, NOW(), NOW()),
          (gen_random_uuid(), '分析模式', '详细表格+图表+解读，适合深度分析', $content2, '["datetime"]', true, 'system', NULL, NOW(), NOW()),
          (gen_random_uuid(), '应急模式', '紧急情况 checklist，按优先级排序', $content3, '["datetime"]', false, 'system', NULL, NOW(), NOW())
    """)

def downgrade() -> None:
    op.execute("DELETE FROM prompt_templates WHERE category = 'system' AND name IN ('巡检模式', '分析模式', '应急模式')")
```

> 注意：实际迁移中 content 需要转义，建议用 Python 的 `op.execute(sa.text(...).bindparams(...))` 或在 seed_prompts.py CLI 命令中插入（更灵活）。

#### 验证方法

```bash
uv run alembic upgrade head
uv run ai_agent_test cmd seed-prompts
# API 验证
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/prompts
# 应返回 4 个模板（1 个原有 default + 3 个新业务模板），"分析模式" is_active=true
```

---

### Phase 4：RAG 运营知识库文档

> **依赖**：无（可与 Phase 1-3 并行）| **工时**：2-3h

#### 新建文件

**`backend/docs/mobility_ops_manual.md`** — 运营手册（~3000 字）

内容大纲：

1. **车辆调运标准流程**
   - 堆积判定：单站点车辆 > 50 辆且 24h 未移动
   - 响应等级：黄色（50-80 辆）→ 橙色（80-120 辆）→ 红色（> 120 辆）
   - 调运时效：黄色 4h 内、橙色 2h 内、红色 1h 内
   - 调运路线规划：就近原则 + 载运量匹配

2. **恶劣天气应急预案**
   - 暴雨预警：暂停低洼区域投放，增加排水区域清运频次
   - 高温预警（>35°C）：增加电单车投放比例（省力需求上升）
   - 大雪/冰冻：暂停所有投放，全面回收至室内站点
   - 雾霾（AQI>200）：发送用户骑行安全提示

3. **站点维护排期**
   - 日检：车辆卫生、刹车/轮胎检查
   - 周检：电子锁/蓝牙模块测试、太阳能板清洁
   - 月检：地面桩位校准、网络模块固件升级

4. **需求预测方法论**
   - 基线：最近 4 周同时段平均值
   - 天气修正：雨天单车需求 ↑15%，电单车需求 ↓20%
   - 工作日修正：周一需求高峰 ×1.1，周五 ×0.95
   - 事件修正：大型活动、节假日、地铁故障等

5. **关键运营指标定义**
   - 利用率 = 日均骑乘次数 / 投放总量 × 100%
   - 可用率 = 可借车辆数 / 总投放数 × 100%
   - 调运成本 = 单次调运费用 × 调运次数
   - 用户投诉率 = 投诉订单数 / 总订单数 × 100%

6. **安全事故处理流程**
   - 用户受伤：1h 内客服回访 → 24h 内现场排查 → 48h 内报告
   - 车辆故障致事故：立即封存车辆 → 技术分析 → 改进措施

#### 验证方法

```bash
uv run ai_agent_test rag-ingest docs/mobility_ops_manual.md --collection mobility_ops
# 对话验证
# 问："暴雨天气调度策略是什么？" → 应触发 search_documents
# 问："车辆堆积超过多少辆需要调运？" → 应从知识库引用
```

---

### Phase 5：集成测试 + Demo 打磨

> **依赖**：所有 Phase | **工时**：3-4h

#### E2E 验证场景

| # | 用户输入 | 预期工具调用 | 预期输出 |
|---|---------|------------|---------|
| 1 | "浦东新区上周日均订单量是多少" | `mcp_execute_query` | SQL 面板 + 数字回答 "日均 XXX 单" |
| 2 | "徐家汇商圈车辆缺口最大的 3 个投放点" | `mcp_execute_query` | Top 3 列表 + 调度建议 |
| 3 | "哪些区域最近有车辆堆积" | `mcp_execute_query` | 异常列表 + 清运建议 |
| 4 | "最近一周早晚高峰用车趋势" | `mcp_execute_query` → `mcp_create_echart` | ECharts 双折线图 + 趋势解读 |
| 5 | "暴雨天气调度策略" | `search_documents` | 知识库引用 + 结构化回答 |
| 6 | 激活"巡检模式" → 再问 #1 | 同 #1 | bullet 格式回答 |
| 7 | 激活"应急模式" → 再问 #3 | 同 #3 | checklist 格式 |

#### 边界测试

- 输入不存在的区域名（如"朝阳 区"）→ Agent 提示模糊匹配
- 查询返回空结果 → Agent 友好解释
- LLM 生成错误 SQL → pg_query_error → Agent 自动修正重试

#### Demo 启动流程文档

更新 `backend/.env.example` 和项目 README，添加：

```bash
# 一键启动 Demo
docker compose up -d                          # PostgreSQL + Redis + Milvus
cd backend
uv run alembic upgrade head                   # 运行迁移
uv run ai_agent_test cmd seed-mobility --clear # 种子数据
uv run ai_agent_test cmd seed-prompts          # Prompt 模板
MCP_ENABLED=true uv run uvicorn app.main:app --reload
cd ../frontend && bun dev                      # 前端
```

---

## 4. 关键文件总览

### 新建文件（10 个）

| 文件 | Phase | 说明 |
|------|-------|------|
| `backend/app/db/models/mobility.py` | 0 | 5 个 SQLAlchemy 模型 |
| `backend/alembic/versions/0021_create_mobility_tables.py` | 0 | 建表迁移 |
| `backend/app/commands/seed_mobility.py` | 0 | 种子数据 CLI 命令 |
| `backend/app/agents/mcp_servers/pg_query_server.py` | 1 | NL2SQL MCP Server |
| `backend/app/agents/mcp_servers/chart_server.py` | 1 | ECharts MCP Server |
| `frontend/src/components/chat/echart-message.tsx` | 2 | ECharts 前端渲染器 |
| `frontend/src/components/chat/pg-query-result.tsx` | 2 | SQL 面板 + 数据表渲染器 |
| `backend/app/commands/seed_prompts.py` | 3 | Prompt 模板种子命令 |
| `backend/alembic/versions/0022_seed_mobility_prompts.py` | 3 | Prompt 模板数据迁移 |
| `backend/docs/mobility_ops_manual.md` | 4 | 运营知识库文档 |

### 修改文件（7 个）

| 文件 | Phase | 改动 |
|------|-------|------|
| `backend/app/db/models/__init__.py` | 0 | import + `__all__` 添加 5 个模型 |
| `backend/alembic/env.py` | 0 | import mobility 模型 |
| `backend/app/core/config.py` | 1 | MCP_SERVERS 添加 pg_query + echarts |
| `backend/app/main.py` | 1 | lifespan 注入 DATABASE_URL |
| `frontend/package.json` | 2 | 添加 echarts 依赖 |
| `frontend/src/types/chat.ts` | 2 | 添加 EChartPayload + PgQueryPayload |
| `frontend/src/components/chat/tool-call-card.tsx` | 2 | 路由新渲染器 |

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| NL2SQL 生成错误 SQL | Demo 翻车 | System prompt 含完整 schema + 10+ 示例查询；error 结果回传 LLM 自动重试；表白名单兜底 |
| ECharts 打包过大 | 页面加载慢 | `echarts/core` tree-shaking，只引入 5 种 chart type + CanvasRenderer，预计 ~200KB |
| pg_query MCP 子进程 DB 连接失败 | 数据查询不可用 | env 注入 DATABASE_URL；启动时检测连接；连接失败时仍启动但返回明确错误信息 |
| 种子数据不够真实 | 面试官一眼假 | 18 个上海真实地点硬编码；订单用 gauss + triangular 统计分布模拟高峰 |
| Prompt 模板未加载 | Agent 行为异常 | `agent_session.py` 已有 fallback 到硬编码 prompt（`prompts.py` 的 `DEFAULT_SYSTEM_PROMPT`） |
| MCP Server 子进程启动失败 | MCP 不可用 | `main.py` lifespan 已有 try/except，失败时 fallback 到内置能力，不影响核心功能 |

---

## 6. 工时估算

| Phase | 小时 | 关键风险点 |
|-------|------|-----------|
| Phase 0: DB + 种子 | 3-4 | 数据真实性（硬编码地点 + 统计分布） |
| Phase 1: MCP Server | 5-6 | pg_query SQL 安全是关键路径 |
| Phase 2: 前端 | 4-5 | ECharts tree-shaking + 流式渲染防重渲染 |
| Phase 3: Prompt | 2-3 | Prompt 质量（需迭代测试） |
| Phase 4: RAG | 2-3 | 运营手册内容专业度 |
| Phase 5: 集成 | 3-4 | NL2SQL 准确率调优 |
| **合计** | **19-25** | **~3-4 个工作日** |
