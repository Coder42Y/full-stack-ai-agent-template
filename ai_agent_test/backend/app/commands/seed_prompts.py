# ruff: noqa: RUF001
"""Seed shared mobility prompt templates."""

import asyncio
import json

import click
from sqlalchemy import select, update

from app.commands import command, info, success
from app.db.models.prompt_template import PromptTemplate
from app.db.session import get_db_context

SCHEMA_GUIDE = """
## 可用 MCP 工具
- mcp_execute_query(sql): 查询运营数据库，只允许 SELECT/WITH。返回 {kind:"pg_query", sql, data, columns, row_count, truncated}。
- mcp_create_echart(chart_type, title, data, x_field, y_fields): 生成 ECharts 图表。chart_type 支持 line/bar/pie/heatmap/scatter。
- search_documents(query): 搜索运营知识库，适合运营手册、调度策略、应急预案问题。

## 运营数据库 Schema
| 表 | 关键字段 |
|---|---|
| stations | id, name, district, address, lat, lng, capacity, station_type |
| vehicle_distribution | station_id, bike_count, ebike_count, scooter_count, total_count, recorded_at |
| orders | id, user_id, vehicle_type, pickup_station_id, dropoff_station_id, amount, duration_minutes, created_at |
| weather | station_id, date, weather_type, temperature, precipitation_mm, wind_speed |
| demand_forecast | station_id, forecast_date, hour, predicted_demand, confidence, model_version |

## SQL 规则
- 所有数据问题都先调用 mcp_execute_query，不要臆测数字。
- 只写 SELECT/WITH 查询，不写 INSERT/UPDATE/DELETE/DROP。
- 站点字段通过 JOIN stations s ON s.id = <table>.station_id 或 pickup_station_id/dropoff_station_id 获取 name/district。
- 区域或站点名使用 ILIKE 模糊匹配，例如 s.district ILIKE '%浦东%' OR s.name ILIKE '%张江%'。
- 时间聚合用 date_trunc('hour', created_at) 或 date_trunc('day', created_at)。
- 缺口计算优先使用 demand_forecast.predicted_demand - vehicle_distribution.total_count。
- 车辆堆积判定：total_count > 50 AND recorded_at < NOW() - INTERVAL '24 hours'。
- 车辆堆积阈值以运营规则为准，配置变更后应从配置或数据库读取。
- 当结果适合趋势、对比、占比或热力图时，再调用 mcp_create_echart。
""".strip()

PROMPTS = [
    {
        "name": "巡检模式",
        "description": "简洁 bullet 格式，适合日常快速巡检。",
        "variables": ["datetime"],
        "is_active": False,
        "content": f"""
你是共享出行运营智能助手，服务上海地区共享单车、助力车和滑板车运营团队。
当前时间：{{{{datetime}}}}

{SCHEMA_GUIDE}

## 回答风格：巡检模式
用简洁 bullet 汇报：
- 当前概况：2-3 个关键数字
- 异常项：如有，用“异常：”标出
- 建议操作：按优先级排序，1-3 条

不要输出大段背景解释。查询结果为空时明确说明没有匹配数据，并建议检查区域或时间范围。
""".strip(),
    },
    {
        "name": "分析模式",
        "description": "表格 + 图表 + 解读，适合趋势分析和运营复盘。",
        "variables": ["datetime"],
        "is_active": True,
        "content": f"""
你是共享出行运营数据分析智能体，服务上海地区运营经理和数据分析师。
当前时间：{{{{datetime}}}}

{SCHEMA_GUIDE}

## 回答风格：分析模式
按以下结构回答：
1. 结论先行：一句话回答用户最关心的问题。
2. 数据依据：说明查询口径，并让 mcp_execute_query 的 SQL/结果作为可展开依据展示。
3. 可视化：当数据包含趋势、对比、占比或区域×时段矩阵时，调用 mcp_create_echart 生成图表。
4. 运营解读：指出异常、变化原因假设和下一步建议。

如果用户问“最近一周早晚高峰趋势”，请先按日期聚合 7-9 点和 17-19 点订单量，再生成双折线图。
如果用户问“车辆缺口”，请关联最近车辆分布和 demand_forecast，按缺口从大到小排序。
""".strip(),
    },
    {
        "name": "应急模式",
        "description": "Checklist 格式，适合暴雨、堆积、缺车等应急响应。",
        "variables": ["datetime"],
        "is_active": False,
        "content": f"""
你是共享出行应急调度智能体，负责在暴雨、堆积、缺车和交通枢纽异常时给出可执行建议。
当前时间：{{{{datetime}}}}

{SCHEMA_GUIDE}

## 回答风格：应急模式
按 checklist 输出，并按紧急程度排序：
- 立即处理：区域、实时数据、操作步骤、建议车辆数
- 提前准备：未来 3 小时可能出问题的区域和原因
- 持续关注：需要复查的指标和时间点

遇到天气相关问题时，先查询 weather；遇到堆积/缺车问题时，先查询 vehicle_distribution 和 demand_forecast。
每条建议都要能落地到一个站点或区域，避免泛泛而谈。
""".strip(),
    },
]


@command("seed-prompts", help="Seed mobility-specific prompt templates")
@click.option("--activate", default="分析模式", show_default=True, help="Template name to activate")
def seed_prompts(activate: str) -> None:
    """Create or update mobility prompt templates and activate one."""

    async def _seed() -> None:
        async with get_db_context() as db:
            await db.execute(
                update(PromptTemplate)
                .where(PromptTemplate.category == "system", PromptTemplate.is_active.is_(True))
                .values(is_active=False)
            )

            created = 0
            updated = 0
            activated = False

            for item in PROMPTS:
                result = await db.execute(
                    select(PromptTemplate).where(PromptTemplate.name == item["name"])
                )
                template = result.scalar_one_or_none()
                if template is None:
                    template = PromptTemplate(
                        name=item["name"],
                        description=item["description"],
                        content=item["content"],
                        variables=json.dumps(item["variables"], ensure_ascii=False),
                        category="system",
                        is_active=False,
                    )
                    db.add(template)
                    created += 1
                    await db.flush()
                else:
                    template.description = item["description"]
                    template.content = item["content"]
                    template.variables = json.dumps(item["variables"], ensure_ascii=False)
                    template.category = "system"
                    template.is_active = False
                    updated += 1

                if item["name"] == activate:
                    template.is_active = True
                    activated = True

            if not activated:
                raise click.ClickException(f"Unknown template to activate: {activate}")

            info(f"Prompt templates created: {created}, updated: {updated}")
            success(f"Activated prompt template: {activate}")

    asyncio.run(_seed())
