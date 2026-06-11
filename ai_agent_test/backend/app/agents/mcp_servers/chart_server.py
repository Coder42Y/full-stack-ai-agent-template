"""ECharts MCP server for the mobility demo."""

import json
from typing import Any

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("echarts")

PALETTE = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"]


def _payload(kind: str, **kwargs: Any) -> str:
    return json.dumps({"kind": kind, **kwargs}, ensure_ascii=False)


def _parse_rows(data: str) -> list[dict[str, Any]]:
    try:
        rows = json.loads(data)
    except json.JSONDecodeError as exc:
        raise ValueError(f"data must be a JSON array string: {exc}") from exc
    if not isinstance(rows, list):
        raise ValueError("data must be a JSON array.")
    if not all(isinstance(row, dict) for row in rows):
        raise ValueError("each data item must be an object.")
    return rows


def _parse_y_fields(y_fields: str, rows: list[dict[str, Any]], x_field: str) -> list[str]:
    if y_fields:
        try:
            parsed = json.loads(y_fields)
        except json.JSONDecodeError as exc:
            raise ValueError(f"y_fields must be a JSON array string: {exc}") from exc
        if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
            raise ValueError("y_fields must be a JSON array of strings.")
        return parsed

    if not rows:
        return []
    return [
        key
        for key, value in rows[0].items()
        if key != x_field and isinstance(value, int | float) and not isinstance(value, bool)
    ]


def _axis_option(
    title: str, rows: list[dict[str, Any]], x_field: str, y_fields: list[str], chart_type: str
) -> dict[str, Any]:
    x_data = [row.get(x_field) for row in rows]
    series_type = "line" if chart_type == "line" else "bar" if chart_type == "bar" else "scatter"
    series: list[dict[str, Any]] = []
    for idx, field in enumerate(y_fields):
        item: dict[str, Any] = {
            "name": field,
            "type": series_type,
            "data": [row.get(field, 0) for row in rows],
            "itemStyle": {"color": PALETTE[idx % len(PALETTE)]},
        }
        if chart_type == "line":
            item["smooth"] = True
        series.append(item)

    return {
        "title": {"text": title, "left": "center"},
        "color": PALETTE,
        "tooltip": {"trigger": "axis"},
        "legend": {"top": 32, "data": y_fields},
        "grid": {"left": 48, "right": 24, "top": 80, "bottom": 48},
        "xAxis": {"type": "category", "data": x_data},
        "yAxis": {"type": "value"},
        "series": series,
    }


def _pie_option(
    title: str, rows: list[dict[str, Any]], x_field: str, y_fields: list[str]
) -> dict[str, Any]:
    value_field = y_fields[0] if y_fields else "value"
    return {
        "title": {"text": title, "left": "center"},
        "color": PALETTE,
        "tooltip": {"trigger": "item"},
        "legend": {"bottom": 0},
        "series": [
            {
                "name": title,
                "type": "pie",
                "radius": ["38%", "68%"],
                "avoidLabelOverlap": True,
                "data": [
                    {"name": str(row.get(x_field, "")), "value": row.get(value_field, 0)}
                    for row in rows
                ],
            }
        ],
    }


def _heatmap_option(
    title: str, rows: list[dict[str, Any]], x_field: str, y_fields: list[str]
) -> dict[str, Any]:
    y_field = y_fields[0] if y_fields else "y"
    value_field = y_fields[1] if len(y_fields) > 1 else "value"
    x_values = list(dict.fromkeys(str(row.get(x_field, "")) for row in rows))
    y_values = list(dict.fromkeys(str(row.get(y_field, "")) for row in rows))
    x_index = {value: idx for idx, value in enumerate(x_values)}
    y_index = {value: idx for idx, value in enumerate(y_values)}
    values = [
        [
            x_index[str(row.get(x_field, ""))],
            y_index[str(row.get(y_field, ""))],
            row.get(value_field, 0),
        ]
        for row in rows
    ]
    max_value = max((float(item[2] or 0) for item in values), default=1.0)
    return {
        "title": {"text": title, "left": "center"},
        "tooltip": {"position": "top"},
        "grid": {"left": 88, "right": 36, "top": 72, "bottom": 72},
        "xAxis": {"type": "category", "data": x_values, "splitArea": {"show": True}},
        "yAxis": {"type": "category", "data": y_values, "splitArea": {"show": True}},
        "visualMap": {
            "min": 0,
            "max": max_value,
            "calculable": True,
            "orient": "horizontal",
            "left": "center",
            "bottom": 16,
            "inRange": {"color": ["#e0f2fe", "#2563eb"]},
        },
        "series": [
            {
                "name": title,
                "type": "heatmap",
                "data": values,
                "label": {"show": False},
                "emphasis": {"itemStyle": {"shadowBlur": 8, "shadowColor": "rgba(0,0,0,0.25)"}},
            }
        ],
    }


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
        chart_type: Chart type: line, bar, pie, heatmap, or scatter.
        title: Chart title.
        data: JSON string containing an array of row objects.
        x_field: Field used for the x-axis or category label.
        y_fields: JSON array of field names for values. For heatmap, use [y_field, value_field].

    Returns:
        JSON string: {"kind": "echart", "option": {...}}
    """
    chart_type = chart_type.strip().lower()
    try:
        rows = _parse_rows(data)
        if not rows:
            raise ValueError("data must contain at least one row.")
        resolved_x_field = x_field or next(iter(rows[0].keys()))
        resolved_y_fields = _parse_y_fields(y_fields, rows, resolved_x_field)
        if chart_type in {"line", "bar", "scatter"}:
            option = _axis_option(title, rows, resolved_x_field, resolved_y_fields, chart_type)
        elif chart_type == "pie":
            option = _pie_option(title, rows, resolved_x_field, resolved_y_fields)
        elif chart_type == "heatmap":
            option = _heatmap_option(title, rows, resolved_x_field, resolved_y_fields)
        else:
            raise ValueError("chart_type must be one of: line, bar, pie, heatmap, scatter.")
    except Exception as exc:
        return _payload("echart_error", error=str(exc))

    return _payload("echart", option=option)


if __name__ == "__main__":
    mcp.run()
