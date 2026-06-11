---
type: spec
source:
  - PRD-业务版.md
  - UserStories.md
created: 2026-06-10
status: draft
scope: 功能点拆分规格说明
---

# Spec：AI 运营数据分析智能体平台 — 功能点拆分

> **来源文档：** [PRD-业务版.md](../PRD-业务版.md) + [UserStories.md](../UserStories.md)
> **基线骨架：** `template/{{cookiecutter.project_slug}}/`
> **编写日期：** 2026-06-10

---

## 0. 文档导航

本文档将 PRD 和用户故事拆解为 **8 个功能模块（Feature Module）**，每个模块包含：

| 章节 | 内容 |
|------|------|
| **功能概述** | 一句话说明这个模块做什么 |
| **覆盖的用户故事** | 哪些 US 在此模块中实现 |
| **数据模型** | 数据库表、字段、索引 |
| **API 契约** | 端点、请求/响应 schema |
| **文件结构** | 需要创建/修改的文件清单 |
| **依赖关系** | 依赖哪些其他模块 |
| **验收标准** | 完成的定义 |

---

## 1. 模块总览与依赖图

```
                    ┌──────────────────────────────────────────┐
                    │          M0: Demo 种子数据                │
                    │  (orders, vehicle_distribution, weather)  │
                    └─────────────┬────────────────────────────┘
                                  │ 数据基础
                    ┌─────────────▼────────────────────────────┐
                    │      M1: MCP 数据查询 Server              │
                    │  (pg_query_server — NL2SQL + 执行)        │
                    └─────────────┬────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────▼─────────┐  ┌─────▼───────┐  ┌───────▼─────────┐
    │ M2: MCP 图表 Server │  │ M3: Supervisor │  │ M4: RAG 运营    │
    │ (chart_server)      │  │   Agent        │  │     知识库      │
    └─────────┬──────────┘  │ (意图路由)     │  │ (文档+检索)     │
              │              └──────┬────────┘  └───────┬────────┘
              │                     │                   │
              └──────────┬──────────┘                   │
                         │                              │
              ┌──────────▼──────────┐                   │
              │  M5: Prompt 模板管理  │◄──────────────────┘
              │  (CRUD + 激活)       │  (模板应用于 Agent)
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ M6: 前端 Chat 增强    │
              │ (图表/表格/告警渲染)   │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │ M7: 运维监控面板      │
              │ (MCP 状态/调用日志)   │
              └─────────────────────┘
```

---

## 2. 模块矩阵

| 模块 | 覆盖 US | 优先级 | 新增/修改 | 工作量 |
|------|---------|--------|----------|--------|
| **M0: Demo 种子数据** | — (基础设施) | P0 | 新增 | 2 天 |
| **M1: MCP 数据查询 Server** | US-01, US-02, US-03, US-04, US-05 | P0 | 新增 | 3 天 |
| **M2: MCP 图表 Server** | US-06, US-07, US-08, US-05 | P0 | 新增+修改 | 2 天 |
| **M3: Supervisor Agent** | US-01~US-05 (路由), US-09, US-10 | P0 | 新增 | 3 天 |
| **M4: RAG 运营知识库** | US-12, US-13 | P1 | 新增内容 | 2 天 |
| **M5: Prompt 模板管理** | US-14, US-15 | P0 | 扩展现有 | 2 天 |
| **M6: 前端 Chat 增强** | 所有 US (展示层) | P1 | 修改 | 3 天 |
| **M7: 运维监控面板** | US-16, US-17 | P2 | 新增+修改 | 3 天 |
| **M8: 异常告警通知** | US-11 | P3（Sprint 4 迭代） | 新增 | 2 天 |

> **注：** M8（异常告警通知）为 P3 优先级，依赖 Celery 定时任务 + WebSocket 推送，核心功能（M0-M7）完成后迭代。US-11 的需求已在 UserStories.md 中完整定义，本 spec 第 9 节给出简要规格。

---

## M0：Demo 种子数据

### 功能概述

生成共享出行 Demo 场景的三张业务表及种子数据，为所有数据查询和分析功能提供数据基础。

### 覆盖的用户故事

本模块不直接对应用户故事，但为 US-01 ~ US-10 提供数据基础。

### 数据模型

#### 表 `orders`（订单表）

```sql
CREATE TABLE orders (
    id            BIGSERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    region        VARCHAR(100) NOT NULL,       -- 区域名称（50 个预设区域）
    vehicle_type  VARCHAR(20)  NOT NULL,       -- 'bike' | 'ebike' | 'scooter'
    amount        DECIMAL(10,2) NOT NULL,      -- 订单金额 1.00 ~ 50.00 元
    user_id       UUID NOT NULL,               -- 随机 UUID
    duration_min  INTEGER,                     -- 骑行时长（分钟）
    distance_km   DECIMAL(5,2)                 -- 骑行距离（公里）
);

CREATE INDEX idx_orders_region ON orders (region);
CREATE INDEX idx_orders_created_at ON orders (created_at);
CREATE INDEX idx_orders_vehicle_type ON orders (vehicle_type);
CREATE INDEX idx_orders_region_created ON orders (region, created_at);
```

**生成逻辑：**
- 1000 条记录
- 50 个区域（上海主要区域：张江、徐家汇、陆家嘴、人民广场等）
- 3 种车型（bike / ebike / scooter）
- 金额 1.00 ~ 50.00 元随机
- 时间戳分布：早晚高峰（7-9点、17-19点）权重 60%，其余时段 40%
- 时间范围：最近 30 天

#### 表 `vehicle_distribution`（车辆分布表）

```sql
CREATE TABLE vehicle_distribution (
    id            BIGSERIAL PRIMARY KEY,
    region        VARCHAR(100) NOT NULL,
    hour          INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    bike_count    INTEGER NOT NULL DEFAULT 0,
    ebike_count   INTEGER NOT NULL DEFAULT 0,
    scooter_count INTEGER NOT NULL DEFAULT 0,
    last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_at   DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_vd_region_hour ON vehicle_distribution (region, hour);
CREATE INDEX idx_vd_region_date ON vehicle_distribution (region, recorded_at);
CREATE UNIQUE INDEX idx_vd_unique ON vehicle_distribution (region, hour, recorded_at);
```

**生成逻辑：**
- 50 区域 × 24 小时 × 7 天 = 8,400 条
- 单车分布曲线：早高峰（7-9 点）谷底（用户骑走），晚高峰后回升
- 电单车分布：类似但振幅更小
- 随机注入 3-5 个"堆积"数据点（车辆 > 50 且 last_updated 超过 24 小时）

#### 表 `weather`（天气表）

```sql
CREATE TABLE weather (
    id              BIGSERIAL PRIMARY KEY,
    region          VARCHAR(100) NOT NULL,
    date            DATE NOT NULL,
    weather_type    VARCHAR(20) NOT NULL,    -- 'sunny' | 'cloudy' | 'rain' | 'heavy_rain' | 'snow'
    temperature     DECIMAL(4,1),            -- -5.0 ~ 38.0 °C
    precipitation   DECIMAL(5,2) DEFAULT 0,  -- 降水量 mm
    wind_speed      DECIMAL(4,1) DEFAULT 0   -- 风速 m/s
);

CREATE INDEX idx_weather_region_date ON weather (region, date);
CREATE UNIQUE INDEX idx_weather_unique ON weather (region, date);
```

**生成逻辑：**
- 50 区域 × 7 天 = 350 条
- 天气类型分布：晴天 40%、多云 30%、小雨 20%、暴雨 8%、雪 2%
- 温度与天气关联：暴雨天温度偏低
- 注入 1-2 天暴雨天气（触发应急场景 Demo）

### 文件结构

```
backend/
├── app/
│   ├── db/
│   │   └── models/
│   │       ├── order.py              # 新增：Order SQLAlchemy 模型
│   │       ├── vehicle_distribution.py  # 新增：VehicleDistribution 模型
│   │       └── weather.py            # 新增：Weather 模型
│   └── commands/
│       └── seed_travel_data.py       # 新增：种子数据生成命令
├── alembic/
│   └── versions/
│       └── 0022_create_travel_tables.py  # 新增：建表迁移
└── scripts/
    └── generate_seed_data.py         # 新增：独立数据生成脚本（可 CLI 调用）
```

### API 契约

无对外 API。通过 CLI 命令触发：

```bash
# 生成种子数据并写入数据库
uv run ai_agent_test cmd seed-travel-data

# 清除并重新生成
uv run ai_agent_test cmd seed-travel-data --reset
```

### 依赖关系

- 依赖骨架已有的 PostgreSQL 数据库（`app/db/session.py`）
- 依赖骨架已有的 Alembic 迁移系统
- 依赖骨架已有的 Click CLI 框架（`cli/commands.py`）

### 验收标准

1. `seed-travel-data` 命令执行后，三张表各有对应行数的数据
2. 数据分布符合业务逻辑（高峰权重、天气关联）
3. 包含至少 3 个车辆堆积异常点和 1 天暴雨天气（供后续 Demo 使用）
4. `--reset` 参数可清除旧数据并重新生成
5. 迁移脚本 `0022_create_travel_tables.py` 可通过 `alembic upgrade head` 正确执行

---

## M1：MCP 数据查询 Server（pg_query）

### 功能概述

实现一个 MCP Server，接收自然语言查询意图，由 LLM 将其翻译为 SQL，在 PostgreSQL 上执行，返回结构化结果。这是 NL2SQL 的核心引擎。

### 覆盖的用户故事

| US | 查询场景 |
|----|---------|
| US-01 | 按区域查询聚合指标（日均订单量等） |
| US-02 | 实时查询车辆分布与缺口 |
| US-03 | 跨表关联查询（天气 × 订单） |
| US-04 | 按条件查询车辆堆积 |
| US-05 | 多维度对比分析（本月 vs 上月） |

### 数据模型

无新增数据库表。查询 M0 的三张表。

### API 契约

MCP Server 通过 stdio transport 暴露以下 tools：

#### Tool 1: `query_data`

```json
{
  "name": "query_data",
  "description": "将自然语言问题翻译为 SQL 查询并执行，返回结构化结果。支持 orders、vehicle_distribution、weather 三张表。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "用户的自然语言问题"
      },
      "context": {
        "type": "object",
        "description": "可选的查询上下文",
        "properties": {
          "region": { "type": "string", "description": "用户关注的区域" },
          "time_range": { "type": "string", "description": "时间范围描述" },
          "previous_sql": { "type": "string", "description": "上一轮生成的 SQL（用于追问优化）" }
        }
      }
    },
    "required": ["question"]
  }
}
```

**返回结构：**

```json
{
  "success": true,
  "sql": "SELECT region, AVG(daily_count) as avg_daily ...",
  "columns": ["region", "avg_daily"],
  "rows": [
    {"region": "浦东新区", "avg_daily": 1234}
  ],
  "row_count": 1,
  "execution_time_ms": 45,
  "summary": "上个月浦东新区日均订单量为 1,234 单"
}
```

#### Tool 2: `list_tables`

```json
{
  "name": "list_tables",
  "description": "列出可查询的表及其 schema（表名、列名、类型、注释），供 Agent 了解数据结构",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**返回结构：**

```json
{
  "tables": [
    {
      "name": "orders",
      "description": "订单表",
      "columns": [
        {"name": "id", "type": "BIGSERIAL", "description": "主键"},
        {"name": "created_at", "type": "TIMESTAMPTZ", "description": "创建时间"},
        {"name": "region", "type": "VARCHAR(100)", "description": "区域名称"},
        ...
      ]
    },
    ...
  ]
}
```

### 文件结构

```
backend/
├── app/
│   ├── agents/
│   │   ├── mcp_servers/                    # 新增目录
│   │   │   ├── __init__.py                 # 新增
│   │   │   ├── pg_query_server.py          # 新增：MCP Server 主文件
│   │   │   ├── sql_generator.py            # 新增：LLM→SQL 生成逻辑
│   │   │   ├── sql_validator.py            # 新增：SQL 安全校验
│   │   │   └── schema_context.py           # 新增：表结构上下文构建
│   │   └── tools/
│   │       └── (现有文件不动)
│   └── services/
│       └── mcp_client.py                   # 新增：MCP Client 管理（连接/调用/断开）
└── tests/
    └── test_pg_query_server.py             # 新增
```

### 核心逻辑

#### `pg_query_server.py`

```python
# MCP Server 入口，使用 mcp SDK (stdio transport)
# 注册 query_data 和 list_tables 两个 tool
# 启动命令: python -m app.agents.mcp_servers.pg_query_server
```

**执行流程：**

```
用户自然语言问题
       │
       ▼
  query_data tool
       │
       ├── 1. schema_context.py 构建表结构上下文
       │
       ├── 2. sql_generator.py 将问题 + schema → LLM → SQL
       │      Prompt 包含：表结构 DDL + 示例数据 + 用户问题
       │      约束：只允许 SELECT，禁止 INSERT/UPDATE/DELETE/DROP
       │
       ├── 3. sql_validator.py 校验 SQL 安全性
       │      - 只允许 SELECT 语句
       │      - 禁止子查询中的写操作
       │      - 限制返回行数（MAX 500 行）
       │      - 检测注入风险
       │
       ├── 4. 执行 SQL（asyncpg）
       │
       └── 5. 格式化返回结果 + 生成摘要
```

#### `sql_generator.py` Prompt 设计

```
你是一个 SQL 翻译引擎。将用户的自然语言问题翻译为 PostgreSQL SQL 查询。

## 可用表

{schema_context}

## 规则

1. 只生成 SELECT 查询，不生成 INSERT/UPDATE/DELETE
2. 日期处理：用 PostgreSQL 语法（NOW(), INTERVAL, DATE_TRUNC）
3. 聚合函数：SUM, AVG, COUNT, MAX, MIN
4. 时间范围关键词：
   - "今天" → CURRENT_DATE
   - "昨天" → CURRENT_DATE - INTERVAL '1 day'
   - "上周" → date_trunc('week', CURRENT_DATE) - INTERVAL '1 week'
   - "上个月" → date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
   - "最近 N 天" → CURRENT_DATE - INTERVAL 'N days'
5. 区域字段使用模糊匹配：region ILIKE '%关键词%'
6. 返回 JSON：{"sql": "...", "explanation": "一句话解释查询逻辑"}

## 用户问题

{question}
```

### 依赖关系

- **M0**：查询 orders、vehicle_distribution、weather 三张表
- **外部**：OpenAI API（用于 LLM 生成 SQL）
- **外部**：Python `mcp` SDK（`pip install mcp`）
- **外部**：asyncpg（骨架已有）

### 验收标准

1. `query_data` 能将"上个月浦东新区的日均订单量"翻译为正确的 SQL 并返回结果
2. `query_data` 能将"现在哪些区域车辆堆积超过 50 辆"翻译为正确的 SQL
3. `query_data` 能处理跨表 JOIN（"下雨天 vs 晴天订单量"）
4. `list_tables` 返回三张表的完整 schema
5. SQL 安全校验拒绝所有非 SELECT 语句
6. 查询超时（> 10 秒）返回超时错误
7. 空结果集返回 `{success: true, rows: [], row_count: 0, summary: "未找到匹配数据"}`
8. 区域名不存在时，SQL 使用 ILIKE 模糊匹配，返回最接近的结果

---

## M2：MCP 图表 Server（chart）

### 功能概述

实现一个 MCP Server，接收数据可视化请求，生成 ECharts option JSON，供前端渲染为可交互图表。

### 覆盖的用户故事

| US | 图表类型 |
|----|---------|
| US-05 | 热力图（增长率） |
| US-06 | 折线图（早晚高峰趋势） |
| US-07 | 饼图（车型复购率） |
| US-08 | 热力图（区域×时段订单） |

### 数据模型

无新增数据库表。

### API 契约

#### Tool 1: `create_chart`

```json
{
  "name": "create_chart",
  "description": "根据数据生成 ECharts 图表配置。支持折线图、柱状图、饼图、热力图、面积图。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "chart_type": {
        "type": "string",
        "enum": ["line", "bar", "pie", "heatmap", "area"],
        "description": "图表类型"
      },
      "title": {
        "type": "string",
        "description": "图表标题"
      },
      "data": {
        "type": "object",
        "description": "图表数据，结构因类型而异",
        "properties": {
          "x_axis": { "type": "array", "items": {"type": "string"}, "description": "X轴标签" },
          "series": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "data": { "type": "array", "items": {"type": "number"} }
              }
            }
          },
          "categories": { "type": "array", "items": {"type": "string"} },
          "values": { "type": "array", "items": {"type": "number"} },
          "heatmap_data": { "type": "array", "description": "[[x, y, value], ...]" }
        }
      },
      "options": {
        "type": "object",
        "description": "额外的 ECharts 配置项",
        "properties": {
          "x_label": { "type": "string" },
          "y_label": { "type": "string" },
          "show_legend": { "type": "boolean", "default": true },
          "color_scheme": { "type": "string", "enum": ["default", "warm", "cool", "dark"] }
        }
      }
    },
    "required": ["chart_type", "title", "data"]
  }
}
```

**返回结构：**

```json
{
  "chart_type": "line",
  "title": "最近一周早晚高峰用车趋势",
  "echarts_option": {
    "title": {"text": "最近一周早晚高峰用车趋势"},
    "tooltip": {"trigger": "axis"},
    "legend": {"data": ["早高峰", "晚高峰"]},
    "xAxis": {"type": "category", "data": ["6/3", "6/4", ...]},
    "yAxis": {"type": "value", "name": "订单量"},
    "series": [
      {"name": "早高峰", "type": "line", "data": [120, 135, ...]},
      {"name": "晚高峰", "type": "line", "data": [150, 142, ...]}
    ]
  },
  "summary": "晚高峰订单量整体高于早高峰约 15%，周三为本周峰值"
}
```

### 文件结构

```
backend/
├── app/
│   │   ├── mcp_servers/
│   │   │   ├── chart_server.py             # 新增：MCP Chart Server
│   │   │   └── echarts_builder.py          # 新增：ECharts option 构建器
│   │   └── tools/
│   │       └── chart_tool.py               # 修改：增加与 MCP Chart Server 的集成
└── tests/
    └── test_chart_server.py                # 新增
```

### 核心逻辑

#### `chart_server.py`

```
create_chart tool
       │
       ├── 1. 校验 chart_type 和 data 结构
       │
       ├── 2. echarts_builder.py 根据类型构建 ECharts option
       │      - line → 多折线、tooltip、legend
       │      - bar → 柱状图、自动颜色
       │      - pie → 饼图/环形图、百分比标签
       │      - heatmap → 热力图、visualMap 色带
       │      - area → 面积图、透明填充
       │
       └── 3. 返回完整的 echarts_option JSON
```

#### 与现有 `chart_tool.py` 的关系

骨架已有 `app/agents/tools/chart_tool.py`，它是一个 PydanticAI tool。**MCP Chart Server 是独立进程**，通过 MCP 协议调用。两者可以共存：
- 非 MCP 场景：继续使用 `chart_tool.py`（内置 tool）
- MCP 场景：通过 MCP Client 调用 `chart_server.py`

### 依赖关系

- **M1**：图表数据通常来自 `pg_query` 的查询结果
- **外部**：Python `mcp` SDK
- **前端**：已有 `src/components/chat/chart-message.tsx` 可渲染 ECharts

### 验收标准

1. `create_chart` 生成合法的 ECharts option JSON（可通过 JSON Schema 校验）
2. 支持 line / bar / pie / heatmap / area 五种图表类型
3. 折线图支持多 series（如早晚高峰双线）
4. 热力图支持二维矩阵数据（区域 × 时段）
5. 所有图表包含 title、tooltip、legend（如适用）
6. 图表 option 可直接被前端 `chart-message.tsx` 组件渲染
7. 无效的 data 结构返回明确错误信息

---

## M3：Supervisor Agent（意图路由）

### 功能概述

基于 LangGraph StateGraph 构建 Supervisor Agent，识别用户意图（查数据 / 看趋势 / 异常检测 / 知识问答），路由到对应的 MCP Server 或 RAG 管道，编排多步骤分析链路。

### 覆盖的用户故事

| US | 路由场景 |
|----|---------|
| US-01 ~ US-05 | 数据查询 → `pg_query` |
| US-06 ~ US-08 | 趋势分析 → `pg_query` + `chart` |
| US-09 | 供需预测 → `pg_query` + 内置 `web_search` tool（天气查询） |
| US-10 | 调度建议 → `pg_query` + 内置 `web_search` tool + LLM 综合 |

> **关于 `web_search`：** US-09/US-10 中引用的"天气查询"使用骨架已有的内置 tool `app/agents/tools/web_search.py`（Tavily API），**不是独立的 MCP Server**。它作为 Supervisor Agent 的内置 tool 直接调用，无需额外的 MCP 进程。

### 数据模型

无新增数据库表。使用骨架已有的 `conversations` 和相关表。

### API 契约

Supervisor Agent 作为后端服务层存在，不直接暴露 API。通过骨架已有的 WebSocket 端点调用：

```
WebSocket /api/v1/agent/chat
```

**消息协议（复用骨架已有格式，扩展 `tool_calls` 字段）：**

```json
// 用户发送
{
  "type": "message",
  "content": "上个月浦东新区的日均订单量是多少",
  "conversation_id": "uuid",
  "knowledge_base_id": "uuid (optional)"
}

// Agent 响应（流式）
{
  "type": "assistant",
  "content": "上个月浦东新区日均订单量为 1,234 单。",
  "tool_calls": [
    {
      "tool": "query_data",
      "server": "pg_query",
      "input": {"question": "..."},
      "output": {"sql": "...", "rows": [...]},
      "duration_ms": 234
    }
  ],
  "charts": [
    {
      "chart_type": "line",
      "echarts_option": {...}
    }
  ]
}
```

### 文件结构

```
backend/
├── app/
│   ├── agents/
│   │   ├── supervisor/                      # 新增目录
│   │   │   ├── __init__.py                  # 新增
│   │   │   ├── agent.py                     # 新增：Supervisor Agent 主逻辑
│   │   │   ├── state.py                     # 新增：LangGraph State 定义
│   │   │   ├── router.py                    # 新增：意图分类 + 路由逻辑
│   │   │   ├── nodes.py                     # 新增：各节点实现（query_data/analyze/detect_anomaly/rag_qa/format_response）
│   │   │   └── prompts.py                   # 新增：路由 Prompt + 各节点 Prompt
│   │   ├── langgraph_assistant.py           # 修改：集成 Supervisor Agent
│   │   └── tools/
│   │       └── (现有文件不动)
│   └── services/
│       ├── agent.py                         # 修改：调用 Supervisor Agent
│       └── mcp_client.py                    # 新增：MCP Client 连接池管理
└── tests/
    ├── test_supervisor_router.py            # 新增
    └── test_supervisor_nodes.py             # 新增
```

### 核心逻辑

#### LangGraph StateGraph 拓扑

```
                    ┌─────────────┐
                    │   START     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  classify   │  ← LLM 分类用户意图
                    │  _intent    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┬──────────────┐
              │            │            │              │
       ┌──────▼──────┐ ┌──▼───┐ ┌──────▼──────┐ ┌─────▼──────┐
       │  query_data │ │analyze│ │  detect_    │ │  rag_qa    │
       │  (M1)       │ │(M1+M2)│ │  anomaly   │ │  (M4)      │
       └──────┬──────┘ └──┬───┘ └──────┬──────┘ └─────┬──────┘
              │           │            │              │
              └────────────┴────────────┴──────────────┘
                           │
                    ┌──────▼──────┐
                    │  format     │  ← 格式化输出（表格/图表/文字）
                    │  _response  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    END      │
                    └─────────────┘
```

#### `state.py` — State 定义

```python
from typing import TypedDict, Literal, Optional
from pydantic import BaseModel

class MCPToolCall(BaseModel):
    tool: str
    server: str
    input: dict
    output: Optional[dict] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None

class AgentState(TypedDict):
    question: str                           # 用户原始问题
    intent: Literal["query", "analyze", "anomaly", "qa"]  # 分类结果
    context: dict                           # 上下文（区域、时间等）
    sql: Optional[str]                      # 生成的 SQL
    query_result: Optional[dict]            # 查询结果
    chart_option: Optional[dict]            # 图表配置
    tool_calls: list[MCPToolCall]           # 工具调用记录
    response: str                           # 最终回答
    should_followup: bool                   # 是否需要追问
```

#### `router.py` — 意图分类 Prompt

```
你是共享出行运营助手路由器。分析用户消息，判断意图类别。

## 意图类别

1. **query** — 查询具体数据（订单量、车辆数、某个指标）
   关键词：多少、数量、查询、看看、显示、列出
2. **analyze** — 趋势分析、对比、生成图表
   关键词：趋势、对比、变化、增长、图表、折线、柱状、饼图、热力图
3. **anomaly** — 异常检测、堆积、缺口、应急
   关键词：异常、堆积、缺口、问题、不够、溢出、暴雨、应急
4. **qa** — 知识问答、策略、流程、操作手册
   关键词：怎么、如何、策略、流程、规范、手册、预案

## 输出

返回 JSON：{"intent": "query|analyze|anomaly|qa", "context": {"region": "...", "time_range": "...", "metric": "..."}}

## 用户消息

{question}
```

#### `nodes.py` — 各节点实现规格

每个节点是一个 async 函数，接收 `AgentState`，返回更新后的 `AgentState`：

| 节点函数 | 意图 | 执行逻辑 | MCP 调用 |
|----------|------|---------|---------|
| `query_data(state)` | `query` | 调用 `pg_query.query_data` → 结果写入 `state.query_result` | M1 `pg_query` |
| `analyze(state)` | `analyze` | 先调 `pg_query.query_data` 获取聚合数据，再调 `chart.create_chart` 生成图表 → 结果写入 `state.query_result` + `state.chart_option` | M1 `pg_query` + M2 `chart` |
| `detect_anomaly(state)` | `anomaly` | 调用 `pg_query.query_data`（预置异常阈值 SQL）+ 内置 `web_search` tool 获取天气 → LLM 生成异常标记 + 清运建议 | M1 `pg_query` + 内置 `web_search` |
| `rag_qa(state)` | `qa` | 先调 `pg_query` 获取实时数据（如 US-13 场景），再调 RAG 检索知识库 → LLM 综合生成结构化回答 | M1 `pg_query`（可选）+ M4 RAG |
| `format_response(state)` | 所有 | 读取当前激活的 Prompt 模板（M5），将 `state.query_result` + `state.chart_option` 格式化为最终 `state.response` | M5 模板 |

**`detect_anomaly` 预置异常阈值 SQL 模板：**

```sql
SELECT region, bike_count + ebike_count AS total_vehicles,
       EXTRACT(EPOCH FROM (NOW() - last_updated)) / 3600 AS hours_stale
FROM vehicle_distribution
WHERE (bike_count + ebike_count) > {threshold}
  AND last_updated < NOW() - INTERVAL '{stale_hours} hours'
ORDER BY (bike_count + ebike_count) * EXTRACT(EPOCH FROM (NOW() - last_updated)) DESC
LIMIT 20;
```

**`format_response` 逻辑：**

1. 从 M5 读取当前激活的 Prompt 模板（如有），用 `state.context` 填充变量
2. 用模板 + `state.query_result` + `state.chart_option` 组装 LLM Prompt
3. LLM 生成最终回答 → 写入 `state.response`
4. 若无激活模板，使用默认系统 Prompt

### 依赖关系

- **M1**：调用 `pg_query` Server 执行数据查询
- **M2**：调用 `chart` Server 生成图表
- **M4**：路由到 RAG 管道做知识问答
- **M5**：读取当前激活的 Prompt 模板
- **外部**：LangGraph（`pip install langgraph`）
- **外部**：OpenAI API（用于意图分类和结果生成）

### 验收标准

1. 输入"上个月浦东新区日均订单量"→ 分类为 `query` → 路由到 `query_data` 节点
2. 输入"最近一周早晚高峰趋势"→ 分类为 `analyze` → 路由到 `analyze` 节点 → 同时调用 `pg_query` + `chart`
3. 输入"哪些区域车辆堆积"→ 分类为 `anomaly` → 路由到 `detect_anomaly` 节点
4. 输入"暴雨天调度策略"→ 分类为 `qa` → 路由到 `rag_qa` 节点
5. 模糊意图（如"帮我看看张江的情况"）默认路由到 `query`，返回基础数据后追问
6. 每次路由的 tool_calls 记录在 AgentState 中，供 M7 监控使用
7. MCP Server 不可用时优雅降级（返回文字版数据，不崩溃）

---

## M4：RAG 运营知识库

### 功能概述

利用骨架已有的 RAG 管道，创建共享出行运营知识库，存入运营手册、调度策略、恶劣天气预案等文档，供 Agent 检索回答知识类问题。

### 覆盖的用户故事

| US | 知识检索场景 |
|----|-------------|
| US-12 | 运营知识检索（暴雨调度策略等） |
| US-13 | 个性化应急 Checklist（结合实时数据） |

### 数据模型

使用骨架已有的知识库基础设施：
- `knowledge_bases` 表 — 存知识库元数据
- `rag_documents` 表 — 存文档元数据
- Milvus 向量库 — 存文档向量

**新增知识库内容：**

| 文档名 | 类型 | 内容 |
|--------|------|------|
| `恶劣天气运营预案.md` | Markdown | 暴雨/大雪/台风天的调度流程、安全checklist、人员分工 |
| `日常巡检操作手册.md` | Markdown | 每日巡检流程、关注指标阈值、异常判定标准 |
| `车辆调度策略.md` | Markdown | 投放/清运/调拨的标准流程、优先级判定规则 |
| `区域运营数据解读指南.md` | Markdown | 各指标含义、正常范围、异常判定、常见原因分析 |
| `应急处置SOP.md` | Markdown | 突发事件（堆积、缺车、设备故障）的应急操作步骤 |

### API 契约

使用骨架已有的 RAG API：

```
POST /api/v1/rag/collections              # 创建知识库集合
POST /api/v1/rag/ingest                   # 上传文档并入库
POST /api/v1/rag/search                   # 语义检索
GET  /api/v1/rag/documents                # 列出文档
```

**新增 CLI 命令：**

```bash
# 初始化运营知识库（创建集合 + 导入预设文档）
uv run ai_agent_test cmd init-ops-kb

# 重新导入文档（清除旧向量）
uv run ai_agent_test cmd init-ops-kb --reset
```

### 文件结构

```
backend/
├── app/
│   ├── commands/
│   │   └── rag.py                         # 修改：增加 init-ops-kb 命令
│   └── (rag 管道使用现有 services/rag/ 不修改)
└── data/
    └── ops_knowledge/                     # 新增目录：运营知识文档
        ├── 恶劣天气运营预案.md
        ├── 日常巡检操作手册.md
        ├── 车辆调度策略.md
        ├── 区域运营数据解读指南.md
        └── 应急处置SOP.md
```

### 核心逻辑

#### US-13 个性化 Checklist 的实现

US-13 需要同时查询实时数据 + 知识库。实现路径：

1. Supervisor Agent 路由到 `rag_qa` 节点
2. `rag_qa` 节点先调用 `pg_query` 获取实时数据（天气、车辆分布）
3. 再调用 RAG 检索知识库（应急流程文档）
4. 将实时数据 + 知识库片段 一起交给 LLM 生成个性化 checklist

```
用户问："今天暴雨，我需要做哪些准备"
       │
       ▼
  Supervisor 路由 → qa
       │
       ├── 1. pg_query: "今天哪些区域有暴雨" → 实时天气数据
       ├── 2. pg_query: "这些区域车辆堆积情况" → 实时车辆数据
       ├── 3. RAG search: "暴雨天气应急处置" → 知识库文档片段
       │
       └── 4. LLM 综合 1+2+3 → 个性化 checklist
```

### 依赖关系

- **骨架 RAG**：`app/services/rag/` 全套管道
- **M0**：查询实时天气和车辆数据（用于个性化）
- **M3**：Supervisor Agent 路由到 RAG 节点
- **外部**：Milvus 向量库（骨架已有）
- **外部**：Embedding 模型（骨架已有 OpenAI embedding）

### 验收标准

1. `init-ops-kb` 命令成功创建知识库集合并导入 5 份文档
2. RAG 搜索"暴雨天气调度策略"返回 `恶劣天气运营预案.md` 相关片段
3. RAG 搜索"车辆堆积怎么处理"返回 `应急处置SOP.md` 相关片段
4. 搜索结果中标注引用来源（文档名 + 章节）
5. 知识库中没有相关内容时，返回空结果（不编造）
6. US-13 场景：checklist 中包含实时数据（区域名、具体数字），而非泛泛的流程

---

## M5：Prompt 模板管理

### 功能概述

提供 Prompt 模板的 CRUD、激活/停用、变量替换功能。骨架已有 Prompt 模板管理的基础设施，本模块扩展为支持三种业务场景模板（巡检/分析/应急）。

### 覆盖的用户故事

| US | 场景 |
|----|------|
| US-14 | 创建和激活 Prompt 模板（三种模式） |
| US-15 | Prompt 模板预览与测试 |

### 数据模型

使用骨架已有的模型和表结构。如骨架中无 Prompt 模板表，则新增：

```sql
CREATE TABLE prompt_templates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL UNIQUE,
    description   TEXT,
    content       TEXT NOT NULL,             -- Prompt 正文（含 {{变量}}）
    scene_tag     VARCHAR(50),               -- 场景标签：inspection/analysis/emergency
    variables     JSONB DEFAULT '[]',        -- 变量定义 [{"name": "region", "default": "上海"}]
    is_active     BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompt_templates_active ON prompt_templates (is_active);
CREATE INDEX idx_prompt_templates_scene ON prompt_templates (scene_tag);
```

### API 契约

#### CRUD

```
POST   /api/v1/prompt-templates              # 创建模板
GET    /api/v1/prompt-templates              # 列出所有模板
GET    /api/v1/prompt-templates/:id          # 获取单个模板
PUT    /api/v1/prompt-templates/:id          # 更新模板
DELETE /api/v1/prompt-templates/:id          # 删除模板
```

#### 激活/停用

```
POST   /api/v1/prompt-templates/:id/activate   # 激活（自动停用其他）
POST   /api/v1/prompt-templates/:id/deactivate # 停用
```

#### 预览（US-15）

```
POST   /api/v1/prompt-templates/:id/preview    # 沙盒预览
```

**请求体：**

```json
{
  "test_message": "上个月浦东新区日均订单量是多少",
  "variables": {
    "region": "浦东新区",
    "time": "2026-06-10 08:00"
  }
}
```

**响应：**

```json
{
  "rendered_prompt": "你是共享出行运营助手。当前是 2026-06-10 08:00，区域 浦东新区。请用简洁的 bullet 形式汇报...",
  "agent_response": "浦东新区运营概况：\n- 当前车辆：1,234 辆\n- 异常项：无\n- 建议：...",
  "model_used": "gpt-4o-mini"
}
```

### 文件结构

```
backend/
├── app/
│   ├── db/models/
│   │   └── prompt_template.py             # 新增或修改
│   ├── schemas/
│   │   └── prompt_template.py             # 新增或修改
│   ├── repositories/
│   │   └── prompt_template.py             # 新增或修改
│   ├── services/
│   │   └── prompt_template.py             # 新增或修改
│   └── api/routes/v1/
│       └── prompt_templates.py            # 新增或修改
└── tests/
    └── test_prompt_templates.py           # 新增或修改
```

### 预设模板内容

#### 巡检模式

```markdown
你是共享出行运营助手。当前时间 {{time}}，关注区域 {{region}}。
请用简洁的 bullet 形式汇报：
- 当前车辆分布概况
- 异常项（标红⚠️）
- 建议操作（按优先级排序）
保持简洁，每条不超过一句话。
```

#### 分析模式

```markdown
你是数据分析助手。用户关注 {{metric}} 在 {{time_range}} 的趋势。
请提供：
- 数据摘要（Markdown 表格）
- 趋势图表（ECharts）
- 同比/环比变化
- 趋势解读与洞察
使用专业但易懂的语言，避免术语堆砌。
```

#### 应急模式

```markdown
你处于应急响应模式。当前天气 {{weather}}。时间 {{time}}。
请按 checklist 格式输出：
- 🔴 需要立即处理的区域（按紧急程度排序）
- 🟡 需要提前准备的事项
- 🟢 需要持续关注的指标
每条附具体操作步骤和负责角色。
```

### 依赖关系

- **M3**：Supervisor Agent 读取当前激活的 Prompt 模板
- **骨架已有**：如已有 Prompt 模板基础设施，则在其上扩展

### 验收标准

1. 可创建包含 `{{变量}}` 占位符的 Prompt 模板
2. 激活模板时自动停用旧模板（同时只有一个激活）
3. 变量替换正确（`{{region}}` → `浦东新区`）
4. 停用所有模板时，Agent 使用默认系统 Prompt
5. 预览功能不影响线上 Agent 行为（使用独立 LLM 调用）
6. 预览结果展示渲染后的完整 Prompt

---

## M6：前端 Chat 增强

### 功能概述

增强骨架已有的聊天界面，支持渲染 ECharts 图表、结构化数据表格、异常告警卡片、Checklist 等富文本内容。

### 覆盖的用户故事

所有 US 的前端展示层。

### 数据模型

无新增数据库表。

### API 契约

复用骨架已有的 WebSocket 端点，扩展消息格式：

```typescript
// 扩展 Message 类型
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls?: MCPToolCall[];       // 新增：工具调用记录
  charts?: ChartData[];             // 新增：图表数据
  data_tables?: DataTable[];        // 新增：结构化表格
  alerts?: AlertItem[];             // 新增：告警项
  checklist?: ChecklistItem[];      // 新增：Checklist 项
}

interface ChartData {
  chart_type: "line" | "bar" | "pie" | "heatmap" | "area";
  title: string;
  echarts_option: Record<string, unknown>;
  summary?: string;
}

interface DataTable {
  title: string;
  headers: string[];
  rows: Record<string, unknown>[];
  summary?: string;
}

interface AlertItem {
  level: "critical" | "warning" | "info";
  region: string;
  message: string;
  detail?: string;
  timestamp: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  priority: "high" | "medium" | "low";
  region?: string;
  completed: boolean;
}
```

### 文件结构

```
frontend/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── chart-message.tsx           # 修改：增强 ECharts 渲染
│   │   │   ├── data-table-message.tsx      # 新增：结构化数据表格渲染
│   │   │   ├── alert-message.tsx           # 新增：告警卡片
│   │   │   ├── checklist-message.tsx       # 新增：Checklist 组件
│   │   │   ├── tool-call-card.tsx          # 修改：展示 MCP 调用详情
│   │   │   ├── sql-viewer.tsx              # 新增：SQL 语句折叠展示
│   │   │   └── message-item.tsx            # 修改：路由到新的消息类型组件
│   │   ├── admin/
│   │   │   └── mcp-dashboard.tsx           # 新增：MCP 监控面板（M7）
│   │   └── prompt-templates/               # 新增目录
│   │       ├── template-list.tsx           # 模板列表
│   │       ├── template-editor.tsx         # 模板编辑器
│   │       └── template-preview.tsx        # 模板预览对话框
│   ├── app/[locale]/(dashboard)/
│   │   ├── admin/
│   │   │   └── mcp/                        # 新增：MCP 管理页面
│   │   │       └── page.tsx
│   │   └── prompt-templates/               # 新增：Prompt 模板管理页面
│   │       └── page.tsx
│   ├── types/
│   │   └── chat.ts                         # 修改：扩展消息类型
│   └── lib/
│       ├── echarts-themes.ts               # 新增：ECharts 主题配置
│       └── prompt-templates-api.ts         # 新增：模板 API 调用
```

### 核心组件设计

#### `message-item.tsx` 消息路由逻辑

```typescript
// 根据 message 内容决定渲染哪个组件
function renderMessageContent(message: ChatMessage) {
  return (
    <>
      {/* 基础 Markdown 文本 */}
      <MarkdownContent content={message.content} />

      {/* 图表 */}
      {message.charts?.map((chart, i) => (
        <ChartMessage key={i} chart={chart} />
      ))}

      {/* 数据表格 */}
      {message.data_tables?.map((table, i) => (
        <DataTableMessage key={i} table={table} />
      ))}

      {/* 告警 */}
      {message.alerts?.map((alert, i) => (
        <AlertMessage key={i} alert={alert} />
      ))}

      {/* Checklist */}
      {message.checklist && (
        <ChecklistMessage items={message.checklist} />
      )}

      {/* 工具调用（可折叠） */}
      {message.tool_calls && (
        <ToolCallCard calls={message.tool_calls} />
      )}
    </>
  );
}
```

#### `chart-message.tsx` 增强点

现有 `chart-message.tsx` 已能渲染 ECharts。需要增加：
- 热力图支持（当前可能不支持）
- 图表下方显示 summary 文字
- 图表标题
- 暗色主题适配

#### `sql-viewer.tsx`

```typescript
// 可折叠的 SQL 展示组件
// - 默认折叠，点击展开
// - SQL 语法高亮
// - 复制按钮
// - 执行时间展示
```

### 依赖关系

- **M2**：图表数据来自 MCP Chart Server 的 ECharts option
- **M3**：消息格式由 Supervisor Agent 定义
- **M5**：Prompt 模板管理前端页面
- **骨架已有**：`chart-message.tsx`、`message-item.tsx`、`tool-call-card.tsx`

### 验收标准

1. 折线图在聊天消息中正确渲染，支持悬停查看数值
2. 热力图正确渲染（区域 × 时段矩阵）
3. 数据表格以 Markdown 表格或自定义组件渲染，支持排序
4. SQL 语句默认折叠，点击展开，支持复制
5. 告警卡片有颜色区分（红/黄/蓝）和图标
6. Checklist 支持勾选已完成项
7. 暗色模式下所有组件正确显示
8. 移动端布局不溢出

---

## M7：运维监控面板

### 功能概述

提供 MCP Server 配置管理、连通性检测、工具调用日志查看的运维界面和后端 API。

### 覆盖的用户故事

| US | 场景 |
|----|------|
| US-16 | MCP Server 配置管理（.env + 管理界面） |
| US-17 | Agent 工具调用监控（统计面板） |

### 数据模型

#### 新增表 `mcp_tool_logs`（工具调用日志）

```sql
CREATE TABLE mcp_tool_logs (
    id            BIGSERIAL PRIMARY KEY,
    conversation_id UUID,
    tool_name     VARCHAR(100) NOT NULL,     -- 工具名称（如 query_data）
    server_name   VARCHAR(100) NOT NULL,     -- MCP Server 名称（如 pg_query）
    input_summary TEXT,                       -- 输入摘要（不存完整输入，避免过大）
    output_status VARCHAR(20) NOT NULL,       -- 'success' | 'error' | 'timeout'
    error_message TEXT,                       -- 错误信息（如有）
    duration_ms   INTEGER,                    -- 耗时毫秒
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mcp_logs_server ON mcp_tool_logs (server_name);
CREATE INDEX idx_mcp_logs_created ON mcp_tool_logs (created_at);
CREATE INDEX idx_mcp_logs_status ON mcp_tool_logs (output_status);
```

### API 契约

#### MCP Server 配置

```
GET    /api/v1/mcp/servers                 # 列出所有 MCP Server 及状态
POST   /api/v1/mcp/servers                 # 注册新 MCP Server
PUT    /api/v1/mcp/servers/:name           # 更新配置
DELETE /api/v1/mcp/servers/:name           # 移除
POST   /api/v1/mcp/servers/:name/health    # 手动触发健康检查
```

**GET `/api/v1/mcp/servers` 响应：**

```json
{
  "servers": [
    {
      "name": "pg_query",
      "transport": "stdio",
      "command": "python",
      "args": ["-m", "app.agents.mcp_servers.pg_query_server"],
      "status": "online",
      "last_health_check": "2026-06-10T08:00:00Z",
      "tools": ["query_data", "list_tables"]
    },
    {
      "name": "chart",
      "transport": "stdio",
      "command": "python",
      "args": ["-m", "app.agents.mcp_servers.chart_server"],
      "status": "offline",
      "last_health_check": "2026-06-10T07:55:00Z",
      "error": "Connection refused"
    }
  ]
}
```

#### 工具调用日志

```
GET    /api/v1/mcp/logs                    # 查询调用日志
GET    /api/v1/mcp/logs/stats              # 统计面板数据
GET    /api/v1/mcp/logs/export             # 导出 CSV
```

**GET `/api/v1/mcp/logs/stats` 响应：**

```json
{
  "period": "24h",
  "servers": [
    {
      "name": "pg_query",
      "total_calls": 156,
      "success_rate": 0.98,
      "avg_duration_ms": 234,
      "max_duration_ms": 3200,
      "is_slow": false
    },
    {
      "name": "chart",
      "total_calls": 45,
      "success_rate": 0.91,
      "avg_duration_ms": 5600,
      "max_duration_ms": 12000,
      "is_slow": true
    }
  ],
  "recent_errors": [
    {
      "id": 1234,
      "server_name": "chart",
      "tool_name": "create_chart",
      "error_message": "Invalid heatmap data: missing x_axis",
      "created_at": "2026-06-10T07:45:00Z"
    }
  ]
}
```

### 文件结构

```
backend/
├── app/
│   ├── db/models/
│   │   └── mcp_tool_log.py                # 新增
│   ├── schemas/
│   │   └── mcp.py                         # 新增
│   ├── repositories/
│   │   └── mcp_tool_log.py                # 新增
│   ├── services/
│   │   ├── mcp_client.py                  # 新增：MCP Client 管理器
│   │   └── mcp_monitor.py                 # 新增：日志记录 + 统计
│   └── api/routes/v1/
│       └── mcp.py                         # 新增：MCP 管理 API
└── tests/
    └── test_mcp_monitor.py                # 新增

frontend/
├── src/
│   ├── components/
│   │   └── admin/
│   │       ├── mcp-server-list.tsx         # 新增：Server 列表
│   │       ├── mcp-server-card.tsx         # 新增：Server 状态卡片
│   │       ├── mcp-call-chart.tsx          # 新增：调用统计图表
│   │       └── mcp-log-table.tsx           # 新增：调用日志表格
│   ├── app/[locale]/(dashboard)/
│   │   └── admin/mcp/
│   │       └── page.tsx                    # 新增：MCP 管理页面
│   └── lib/
│       └── mcp-api.ts                      # 新增：MCP API 调用
```

### 核心逻辑

#### `mcp_client.py` — MCP Client 管理器

```python
class MCPClientManager:
    """管理所有 MCP Server 的连接、调用、日志记录"""

    async def connect_all(self) -> dict[str, bool]:
        """启动时连接所有配置的 MCP Server，返回各 Server 连接状态"""

    async def call_tool(self, server: str, tool: str, args: dict) -> dict:
        """调用指定 MCP Server 的 tool，记录日志"""

    async def health_check(self, server: str) -> bool:
        """检查单个 Server 连通性"""

    async def disconnect_all(self):
        """关闭所有连接"""
```

> **注意：** 获取当前激活的 Prompt 模板内容由 M5 的 `PromptTemplateService.get_active()` 提供（见 M5 模块），Supervisor Agent 的 `format_response` 节点直接调用该 service，不走 MCP Client。
```

#### `.env` MCP 配置格式

```bash
# MCP Server 配置（JSON 数组格式）
MCP_SERVERS=[
  {
    "name": "pg_query",
    "transport": "stdio",
    "command": "python",
    "args": ["-m", "app.agents.mcp_servers.pg_query_server"],
    "env": {"DATABASE_URL": "${DATABASE_URL}"}
  },
  {
    "name": "chart",
    "transport": "stdio",
    "command": "python",
    "args": ["-m", "app.agents.mcp_servers.chart_server"]
  }
]
```

### 依赖关系

- **M1**：监控 `pg_query` Server
- **M2**：监控 `chart` Server
- **M3**：记录 Supervisor Agent 的所有 MCP 调用
- **骨架已有**：FastAPI 路由、SQLAlchemy 模型、前端 Admin 页面

### 验收标准

1. Agent 启动时自动连接所有 `.env` 中配置的 MCP Server
2. 不可用的 Server 标记为 `offline`，不影响其他 Server
3. 禁用某个 Server 后，Agent 自动回退到内置能力
4. 调用日志表记录每次 MCP tool call（server、tool、耗时、状态）
5. 统计面板展示：调用次数、成功率、平均耗时
6. 平均耗时 > 5s 的 Server 标记为"慢查询"
7. 支持按时间范围筛选日志
8. 支持导出 CSV

---

## 3. 跨模块数据流

### 用户发起查询的完整链路

```
用户输入: "上个月浦东新区日均订单量是多少"
       │
       ▼
[前端] use-chat.ts (WebSocket)
       │
       ▼
[后端] WebSocket /api/v1/agent/chat
       │
       ▼
[M3] Supervisor Agent
       │
       ├── 1. 读取 [M5] 当前激活的 Prompt 模板
       │
       ├── 2. classify_intent → "query"
       │
       ├── 3. 路由到 query_data 节点
       │      │
       │      ├── 调用 [M7] MCP Client → [M1] pg_query Server
       │      │      │
       │      │      ├── sql_generator → LLM → SQL
       │      │      ├── sql_validator → 安全校验
       │      │      └── 执行 SQL → 返回结果
       │      │
       │      └── [M7] 记录 tool call 日志
       │
       ├── 4. format_response → 格式化输出
       │
       └── 5. 返回给前端
              │
              ▼
[前端] message-item.tsx
       │
       ├── MarkdownContent（文字回答）
       ├── DataTableMessage（查询结果表格）
       └── SQLViewer（可折叠的 SQL 展示）
```

### 趋势分析链路（US-06）

```
用户输入: "最近一周早晚高峰的用车趋势"
       │
       ▼
[M3] Supervisor Agent
       │
       ├── classify_intent → "analyze"
       │
       ├── 路由到 analyze 节点
       │      │
       │      ├── [M1] pg_query: 查询最近 7 天早晚高峰订单量
       │      │
       │      ├── [M2] chart_server: 生成折线图 ECharts option
       │      │
       │      └── LLM: 生成趋势解读文字
       │
       └── 返回: 文字 + 图表 + 表格
              │
              ▼
[前端] message-item.tsx
       ├── MarkdownContent（趋势解读）
       ├── ChartMessage（折线图）
       └── DataTableMessage（数据表）
```

---

## 4. Sprint 规划与里程碑

### Sprint 1（Week 1）：数据基础 + 核心查询

| 模块 | 内容 | 预计天数 |
|------|------|---------|
| M0 | Demo 种子数据（三张表 + 生成脚本） | 2 天 |
| M1 | MCP pg_query Server（NL2SQL + 执行） | 3 天 |
| M3 | Supervisor Agent 基础版（意图分类 + query 路由） | 3 天 |

**里程碑：** 用户可以输入自然语言问题，Agent 返回 SQL 查询结果。

### Sprint 2（Week 2）：图表 + 知识库 + 模板

| 模块 | 内容 | 预计天数 |
|------|------|---------|
| M2 | MCP Chart Server | 2 天 |
| M3 | Supervisor Agent 完善（analyze + anomaly + qa 路由） | 1 天 |
| M4 | RAG 运营知识库（5 份文档 + 导入） | 2 天 |
| M5 | Prompt 模板管理（CRUD + 三种模板） | 2 天 |

**里程碑：** Agent 可以返回图表、回答知识问题、切换回答风格。

### Sprint 3（Week 3）：前端增强 + 运维

| 模块 | 内容 | 预计天数 |
|------|------|---------|
| M6 | 前端 Chat 增强（图表/表格/SQL/告警/Checklist） | 3 天 |
| M7 | 运维监控面板（MCP 状态 + 调用日志） | 2 天 |

**里程碑：** 完整的 Demo 可运行，支持所有核心用户故事。

### Sprint 4（Week 4）：打磨 + 告警 + 面试准备

| 内容 | 预计天数 |
|------|---------|
| M8 异常告警通知（US-11） | 2 天 |
| US-13 个性化 Checklist 完善 | 1 天 |
| 面试叙事线打磨 + 录屏 Demo | 1 天 |
| 文档完善（README + 部署指南） | 1 天 |

---

## 5. 技术约束与假设

### 约束

| 约束 | 说明 |
|------|------|
| MCP Transport | 仅使用 stdio transport（同一机器进程间通信） |
| SQL 安全 | `pg_query` 只允许 SELECT，禁止所有写操作 |
| LLM 调用 | 意图分类使用 `gpt-4o-mini`（快+便宜），SQL 生成和回答使用 `gpt-4o` |
| 图表 | 仅支持 ECharts，前端已有渲染组件 |
| 数据库 | 仅 PostgreSQL（SQLite 不支持部分高级 SQL 特性） |
| 语言 | 仅中文（Prompt、UI、文档均为中文） |

### 假设

| 假设 | 风险 | 缓解措施 |
|------|------|---------|
| LLM 生成的 SQL 准确率 > 90% | 3-5 张简单表的查询准确率高 | SQL validator 兜底 + 错误时重试 |
| MCP Python SDK 稳定 | SDK 较新可能有 bug | 先用最简 API（list_tools + call_tool） |
| Milvus 可用 | 需要 Docker 启动 | docker-compose 已包含 |
| OpenAI API 延迟 < 5s | 网络问题 | 设置 10s 超时 + 重试 |

---

## 6. 新增依赖清单

```toml
# pyproject.toml 新增依赖
[project.dependencies]
mcp = ">=1.0.0"           # MCP Python SDK
langgraph = ">=0.2.0"     # LangGraph（Supervisor Agent）
```

---

## 7. 用户故事覆盖矩阵

| US | 用户故事名称 | 模块 | Sprint | 状态 |
|----|-------------|------|--------|------|
| US-01 | 按区域查询聚合指标 | M1 + M3 | Sprint 1 | 已规格 |
| US-02 | 实时查询车辆分布与缺口 | M1 + M3 | Sprint 1 | 已规格 |
| US-03 | 跨表关联查询 | M1 + M3 | Sprint 3 | 已规格 |
| US-04 | 按条件查询车辆堆积 | M1 + M3 | Sprint 1 | 已规格 |
| US-05 | 多维度对比分析 | M1 + M2 + M3 | Sprint 3 | 已规格 |
| US-06 | 早晚高峰用车趋势图 | M1 + M2 + M3 | Sprint 2 | 已规格 |
| US-07 | 车型复购率分析 | M1 + M2 + M3 | Sprint 3 | 已规格 |
| US-08 | 按区域×时段的用车热力图 | M1 + M2 + M3 | Sprint 3 | 已规格 |
| US-09 | 供需预测 | M3 + 内置 web_search | Sprint 2 | 已规格 |
| US-10 | 综合调度优先级推荐 | M3 + 内置 web_search | Sprint 2 | 已规格 |
| US-11 | 异常告警通知 | **M8**（见下） | Sprint 4 | 已规格（P3） |
| US-12 | 运营知识检索 | M4 | Sprint 2 | 已规格 |
| US-13 | 调度策略 Checklist | M4 + M3 | Sprint 4 | 已规格 |
| US-14 | 创建和激活 Prompt 模板 | M5 | Sprint 2 | 已规格 |
| US-15 | Prompt 模板预览与测试 | M5 | Sprint 3 | 已规格 |
| US-16 | MCP Server 配置管理 | M7 | Sprint 3 | 已规格 |
| US-17 | Agent 工具调用监控 | M7 | Sprint 3 | 已规格 |

> ✅ 全部 17 个用户故事均已覆盖。

---

## 8. M8：异常告警通知（P3 — Sprint 4 迭代）

### 功能概述

定时扫描车辆分布数据，检测堆积异常，通过 WebSocket 主动推送告警到前端聊天界面。

### 覆盖的用户故事

| US | 场景 |
|----|------|
| US-11 | 异常告警通知（调度员收到堆积告警） |

### 数据模型

#### 新增表 `alert_config`（告警配置）

```sql
CREATE TABLE alert_config (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name     VARCHAR(100) NOT NULL,
    metric        VARCHAR(50) NOT NULL,       -- 'vehicle_stacking' | 'order_anomaly'
    threshold     JSONB NOT NULL,              -- {"vehicle_count": 50, "stale_hours": 24}
    scan_interval_minutes INTEGER NOT NULL DEFAULT 15,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

#### 新增表 `alert_events`（告警事件）

```sql
CREATE TABLE alert_events (
    id            BIGSERIAL PRIMARY KEY,
    config_id     UUID REFERENCES alert_config(id),
    region        VARCHAR(100) NOT NULL,
    metric_value  JSONB NOT NULL,              -- {"vehicle_count": 67, "stale_hours": 30}
    severity      VARCHAR(20) NOT NULL,        -- 'critical' | 'warning' | 'info'
    status        VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'acknowledged' | 'resolved'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
);

CREATE INDEX idx_alert_events_status ON alert_events (status);
CREATE INDEX idx_alert_events_region ON alert_events (region, created_at);
```

### 核心逻辑

#### Celery 定时任务

```python
# backend/app/worker/tasks/alert_tasks.py

@app.task
def scan_vehicle_anomalies():
    """
    每 15 分钟执行一次：
    1. 查询 vehicle_distribution 中车辆数 > 阈值 且 stale > 阈值的区域
    2. 检查 alert_events 中该区域是否在 2 小时内已有 active 告警（去重）
    3. 无重复 → 创建 alert_event + WebSocket 推送
    """
```

#### WebSocket 推送消息格式

```json
{
  "type": "alert",
  "alert": {
    "id": 123,
    "region": "徐家汇商圈",
    "severity": "critical",
    "metric_value": {"vehicle_count": 67, "stale_hours": 30},
    "message": "徐家汇商圈车辆堆积 67 辆，已 30 小时未移动",
    "actions": [
      {"label": "查看详情", "type": "navigate", "target": "/chat?query=徐家汇车辆分布"},
      {"label": "标记已处理", "type": "api", "method": "POST", "url": "/api/v1/alerts/123/acknowledge"}
    ],
    "created_at": "2026-06-10T08:15:00Z"
  }
}
```

### 文件结构

```
backend/
├── app/
│   ├── db/models/
│   │   ├── alert_config.py                 # 新增
│   │   └── alert_event.py                  # 新增
│   ├── worker/tasks/
│   │   └── alert_tasks.py                  # 新增：Celery 定时扫描任务
│   ├── api/routes/v1/
│   │   └── alerts.py                       # 新增：告警查询 + 确认 API
│   └── services/
│       └── alert.py                        # 新增：告警业务逻辑
├── alembic/versions/
│   └── 0023_create_alert_tables.py         # 新增

frontend/
├── src/
│   ├── components/
│   │   └── chat/
│   │       └── alert-notification.tsx      # 新增：告警推送卡片
│   └── hooks/
│       └── use-alerts.ts                   # 新增：告警 WebSocket 监听
```

### 依赖关系

- **M0**：扫描 `vehicle_distribution` 表
- **M3**：告警消息通过 Agent WebSocket 通道推送
- **骨架已有**：Celery beat 调度器（`app/worker/celery_app.py`）
- **骨架已有**：WebSocket 基础设施

### 验收标准

1. 每 15 分钟自动扫描一次车辆分布，检测堆积异常
2. 检测到异常时推送告警到前端，包含区域名、堆积数量、检测时间
3. 同一区域 2 小时内不重复推送（去重）
4. 告警卡片有"查看详情"和"标记已处理"按钮
5. 告警阈值可在后台 `alert_config` 表中配置
6. 所有区域无异常时不推送

---

> 本文档基于 [PRD-业务版.md](../PRD-业务版.md) 和 [UserStories.md](../UserStories.md) 按功能点拆分生成。
> 每个模块可独立开发、测试、交付，模块间通过明确的 API 契约和数据模型解耦。
