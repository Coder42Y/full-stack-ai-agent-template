---
type: spec
scope: 功能点 — 运营手册文档编写
phase: Phase 4
priority: P0
blocks: spec-seed-mobility-kb.md（seed 命令依赖本文档生成的文件）
created: 2026-06-10
---

# Spec：共享出行运营手册（mobility_ops_manual.md）

## 功能概述

创建 `backend/docs/mobility_ops_manual.md`，作为 RAG 知识库的核心内容源文件。手册覆盖 6 大运营主题，广度优先，确保各种问法都能命中检索。

## 新建文件

| 文件路径 | 说明 |
|---------|------|
| `ai_agent_test/backend/docs/mobility_ops_manual.md` | 运营手册，~3000 字中文 |

## 内容规格

### 总体要求

- **语言**：中文，专业术语可用英文
- **篇幅**：~3000 字（6 个主题均衡分配，每个主题 400-600 字）
- **格式**：Markdown，用清晰的标题层级（`##` 为主题，`###` 为子节）
- **策略**：广度覆盖——每个主题都要有具体数字、阈值、步骤，让各种问法都能命中
- **关键词密度**：每个主题内反复出现核心术语（如"堆积""调运""暴雨""应急预案"），提高 RAG 检索命中率
- **与数据库数据一致**：手册里的站点名、区域名必须和 `seed_mobility.py` 中的 STATIONS 列表一致（张江地铁站、徐家汇商圈、陆家嘴、虹桥火车站、人民广场等 18 个上海真实投放点）

### 六大主题及内容要点

#### 主题 1：车辆调运标准流程

必须包含：
- 堆积等级定义：一级（>50 辆）、二级（>80 辆）、三级（>120 辆）
- 每级的响应时效要求（如：一级 4 小时内、二级 2 小时内、三级 1 小时内）
- 调运优先级排序规则：先按堆积等级降序，同级按 recorded_at 时间升序（越久未更新越优先）
- 调运执行步骤：确认堆积 → 调配车辆 → 运输 → 到站验收 → 记录
- 特殊情况：地铁站点早晚高峰禁止调运作业（7-9 点、17-19 点）
- 调运完成后更新 vehicle_distribution 记录的要求

#### 主题 2：恶劣天气应急预案

必须包含：
- 四种天气类型：暴雨、高温（>38°C）、大雪、雾霾（AQI > 200）
- 每种天气的分级标准（如暴雨：小雨/中雨/大雨/暴雨，对应不同响应级别）
- 各级别的触发条件和响应动作
- 预调运策略：暴雨预警时提前 2 小时从低洼站点撤离车辆到高地站点
- 暴雨后恢复流程：积水退去后的车辆检查、重新投放步骤
- 高温天车辆检查要点（电池温度、轮胎气压）
- 天气关联：手动查询 weather 表确认实时天气数据

#### 主题 3：站点维护排期

必须包含：
- 日检项目清单：车辆数量盘点、损坏车辆标记、站点卫生、二维码/标识牌完好
- 周检项目清单：车辆刹车/轮胎/座椅/电池系统检查、站点设施（锁桩、太阳能板）
- 月检项目清单：站点容量评估、车辆淘汰/更新计划、区域需求变化分析
- 异常报修流程：发现故障 → 拍照记录 → 系统报修 → 48 小时内处理
- 维护人员配置标准（每 X 个站点 1 名维护员）

#### 主题 4：需求预测方法论

必须包含：
- 预测模型架构：基线预测 + 天气修正系数 + 工作日/节假日修正
- 基线预测：基于历史 28 天同时段均值
- 天气修正：晴天 × 1.0，阴天 × 0.95，小雨 × 0.7，暴雨 × 0.3，大雪 × 0.2
- 工作日修正：工作日早晚高峰 × 1.3，周末全天 × 0.8，节假日 × 0.6
- 置信度解读：>0.8 高可信、0.5-0.8 中等可信、<0.5 需人工复核
- demand_forecast 表字段说明：predicted_demand、confidence、model_version
- 预测更新频率：每日凌晨自动更新，暴雨预警时触发实时更新

#### 主题 5：关键运营指标定义

必须包含以下指标的计算公式和目标值：
- **车辆利用率** = 当日订单数 / 当日平均投放车辆数 × 100%，目标 > 60%
- **站点可用率** = 可用车辆 > 0 的小时数 / 24 × 100%，目标 > 90%
- **调运成本** = 调运次数 × 单次成本（含人力 + 运输），月度 KPI
- **用户投诉率** = 投诉工单数 / 订单总数 × 1000（千分比），目标 < 3‰
- **堆积指数** = 堆积车辆数 × 堆积时长（辆·小时），周度趋势
- **需求缺口** = predicted_demand - total_count，正值表示缺车、负值表示过剩
- 指标异常阈值：利用率 < 40% 需排查、堆积指数 > 500 触发告警

#### 主题 6：安全事故处理流程

必须包含：
- 事故分级：一般事故（轻微伤）、较大事故（重伤）、重大事故（死亡/群体伤）
- 上报时限：一般 24h 内、较大 4h 内、重大 立即
- 现场处置步骤：保护现场 → 救助伤员 → 报警/报120 → 通知公司 → 记录取证
- 后续复盘要求：48h 内完成事故报告、7 天内完成复盘会议
- 骑行事故常见原因：车辆故障（刹车失灵、轮胎爆裂）、用户违规（逆行、载人）
- 车辆故障关联：事故后需检查对应 station 的 vehicle_distribution 记录，标记疑似故障车辆

### 写作风格要求

- 使用专业但易懂的运营语言
- 数字和阈值用具体数值，不用模糊表述（"50 辆"而非"一定数量"）
- 流程步骤用有序列表
- 适当使用表格呈现阈值和等级划分
- 每个主题结尾加一段"常见问题"（2-3 个 Q&A），增加关键词覆盖

## 参考数据

手册内容需要和已有种子数据模型对齐，以下是关键字段参考：

```python
# seed_mobility.py 中的站点示例（共 18 个）
STATIONS = [
    {"name": "张江地铁站", "district": "浦东新区", "station_type": "metro"},
    {"name": "徐家汇商圈", "district": "徐汇区", "station_type": "commercial"},
    {"name": "陆家嘴", "district": "浦东新区", "station_type": "commercial"},
    {"name": "虹桥火车站", "district": "闵行区", "station_type": "metro"},
    {"name": "人民广场", "district": "黄浦区", "station_type": "commercial"},
    {"name": "静安寺", "district": "静安区", "station_type": "commercial"},
    {"name": "中山公园", "district": "长宁区", "station_type": "commercial"},
    {"name": "五角场", "district": "杨浦区", "station_type": "commercial"},
    {"name": "世纪大道", "district": "浦东新区", "station_type": "metro"},
    {"name": "南京东路", "district": "黄浦区", "station_type": "commercial"},
    # ... 共 18 个
]

# 数据库表结构参考
# vehicle_distribution: station_id, bike_count, ebike_count, scooter_count, total_count, recorded_at
# orders: user_id, vehicle_type(bike/ebike/scooter), pickup_station_id, dropoff_station_id, amount, duration_minutes
# weather: station_id, date, weather_type, temperature, precipitation_mm, wind_speed
# demand_forecast: station_id, forecast_date, hour, predicted_demand, confidence, model_version
```

## 验收标准

1. 文件创建在 `ai_agent_test/backend/docs/mobility_ops_manual.md`
2. 篇幅 ~3000 字（允许 ±500 字浮动）
3. 6 个主题全部覆盖，每个主题有具体数字和流程步骤
4. 每个主题有"常见问题"段落
5. 站点名、区域名与 seed_mobility.py 的 STATIONS 列表一致
6. Markdown 格式正确，标题层级清晰（`#` 标题，`##` 主题，`###` 子节）
7. 内容中没有与数据库模型矛盾的地方（如字段名、枚举值）
