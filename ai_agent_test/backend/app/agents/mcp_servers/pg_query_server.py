"""PostgreSQL read-only MCP server for the mobility demo."""

import json
import logging
import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

import psycopg2
import psycopg2.extras
from mcp.server.fastmcp import FastMCP
from psycopg2.extensions import connection as PgConnection

logger = logging.getLogger(__name__)

mcp = FastMCP("pg-query")

ALLOWED_TABLES = {
    "stations",
    "vehicle_distribution",
    "orders",
    "weather",
    "demand_forecast",
}
FORBIDDEN_KEYWORDS = {
    "alter",
    "copy",
    "create",
    "delete",
    "drop",
    "execute",
    "grant",
    "insert",
    "merge",
    "reindex",
    "revoke",
    "truncate",
    "update",
    "vacuum",
}
MAX_ROWS = 500
STATEMENT_TIMEOUT_MS = 10_000

_connection: PgConnection | None = None
_connection_error: str | None = None


@dataclass(frozen=True)
class SqlToken:
    value: str
    depth: int


def _json_default(value: object) -> object:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return str(value)


def _error_payload(sql: str, error: str) -> str:
    return json.dumps(
        {
            "kind": "pg_query_error",
            "sql": sql,
            "error": error,
        },
        ensure_ascii=False,
        default=_json_default,
    )


def _get_connection() -> PgConnection | None:
    global _connection, _connection_error

    if _connection is not None and not getattr(_connection, "closed", True):
        return _connection

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        _connection_error = "DATABASE_URL is not configured for pg_query MCP server."
        return None

    try:
        _connection = psycopg2.connect(database_url)
        _connection.autocommit = True
        _connection_error = None
    except Exception as exc:
        _connection = None
        _connection_error = f"Could not connect to PostgreSQL: {exc}"
        logger.exception("pg_query MCP connection failed")
    return _connection


def _strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    return re.sub(r"--.*?$", " ", sql, flags=re.MULTILINE)


def _has_unquoted_semicolon(sql: str) -> bool:
    in_single_quote = False
    in_double_quote = False
    idx = 0
    while idx < len(sql):
        char = sql[idx]
        if in_single_quote:
            if char == "'" and idx + 1 < len(sql) and sql[idx + 1] == "'":
                idx += 2
                continue
            if char == "'":
                in_single_quote = False
            idx += 1
            continue
        if in_double_quote:
            if char == '"' and idx + 1 < len(sql) and sql[idx + 1] == '"':
                idx += 2
                continue
            if char == '"':
                in_double_quote = False
            idx += 1
            continue

        if char == "'":
            in_single_quote = True
        elif char == '"':
            in_double_quote = True
        elif char == ";":
            return True
        idx += 1
    return False


def _sql_tokens(sql: str) -> list[SqlToken]:
    tokens: list[SqlToken] = []
    depth = 0
    in_single_quote = False
    in_double_quote = False
    idx = 0
    while idx < len(sql):
        char = sql[idx]
        if in_single_quote:
            if char == "'" and idx + 1 < len(sql) and sql[idx + 1] == "'":
                idx += 2
                continue
            if char == "'":
                in_single_quote = False
            idx += 1
            continue
        if in_double_quote:
            if char == '"' and idx + 1 < len(sql) and sql[idx + 1] == '"':
                idx += 2
                continue
            if char == '"':
                in_double_quote = False
            idx += 1
            continue

        if char == "'":
            in_single_quote = True
            idx += 1
            continue
        if char == '"':
            in_double_quote = True
            idx += 1
            continue
        if char == "(":
            depth += 1
            idx += 1
            continue
        if char == ")":
            depth = max(0, depth - 1)
            idx += 1
            continue
        if char.isalpha() or char == "_":
            end = idx + 1
            while end < len(sql) and (sql[end].isalnum() or sql[end] == "_"):
                end += 1
            tokens.append(SqlToken(sql[idx:end].lower(), depth))
            idx = end
            continue
        if char.isdigit():
            end = idx + 1
            while end < len(sql) and sql[end].isdigit():
                end += 1
            tokens.append(SqlToken(sql[idx:end], depth))
            idx = end
            continue
        idx += 1
    return tokens


def _cte_names(tokens: list[SqlToken]) -> set[str]:
    if not tokens or tokens[0].value != "with":
        return set()

    names: set[str] = set()
    for idx, token in enumerate(tokens[1:], start=1):
        if token.depth != 0:
            continue
        if token.value == "select":
            break
        if token.value == "recursive":
            continue

        next_top_level = next((item for item in tokens[idx + 1 :] if item.depth == 0), None)
        if next_top_level and next_top_level.value == "as":
            names.add(token.value)
    return names


def _forbidden_keywords(tokens: list[SqlToken]) -> list[str]:
    cte_names = _cte_names(tokens)
    forbidden: set[str] = set()
    for idx, token in enumerate(tokens):
        if token.value not in FORBIDDEN_KEYWORDS:
            continue
        if token.value in cte_names:
            continue

        previous = tokens[idx - 1] if idx > 0 else None
        if previous and previous.depth == token.depth and previous.value == "as":
            continue

        forbidden.add(token.value)
    return sorted(forbidden)


def _has_outer_numeric_limit(tokens: list[SqlToken]) -> bool:
    for idx, token in enumerate(tokens[:-1]):
        if token.depth == 0 and token.value == "limit" and tokens[idx + 1].value.isdigit():
            return True
    return False


def _referenced_tables(sql: str) -> set[str]:
    table_refs = set()
    pattern = re.compile(
        r"\b(?:from|join|update|into)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)",
        flags=re.IGNORECASE,
    )
    for match in pattern.finditer(sql):
        raw = match.group(1).strip('"')
        table_refs.add(raw.split(".")[-1].strip('"').lower())
    return table_refs


def _validate_sql(sql: str) -> str:
    cleaned = _strip_sql_comments(sql).strip()
    cleaned = cleaned.rstrip(";").strip()
    if not cleaned:
        raise ValueError("SQL is empty.")
    if _has_unquoted_semicolon(cleaned):
        raise ValueError("Only a single SQL statement is allowed.")

    tokens = _sql_tokens(cleaned)
    if not tokens:
        raise ValueError("SQL is empty.")

    first = tokens[0].value
    if first not in {"select", "with"}:
        raise ValueError("Only SELECT or WITH read-only queries are allowed.")

    forbidden = _forbidden_keywords(tokens)
    if forbidden:
        raise ValueError(f"Forbidden SQL keyword(s): {', '.join(forbidden)}.")

    unknown_tables = sorted(_referenced_tables(cleaned) - ALLOWED_TABLES - _cte_names(tokens))
    if unknown_tables:
        raise ValueError(
            "Query references non-whitelisted table(s): "
            f"{', '.join(unknown_tables)}. Allowed tables: {', '.join(sorted(ALLOWED_TABLES))}."
        )

    if not _has_outer_numeric_limit(tokens):
        cleaned = f"{cleaned}\nLIMIT {MAX_ROWS}"

    return cleaned


@mcp.tool()
def execute_query(sql: str) -> str:
    """Execute a read-only SQL query against the shared mobility database.

    The database contains Shanghai shared mobility operational data:
    - stations: stations and operating areas with district, location, capacity, type
    - vehicle_distribution: hourly vehicle counts by station
    - orders: ride orders with pickup/dropoff stations, amount, vehicle type
    - weather: daily weather observations by station
    - demand_forecast: predicted demand by station, date, and hour

    Args:
        sql: A PostgreSQL SELECT query. Only read-only SELECT/WITH queries are allowed.

    Returns:
        JSON string with kind, sql, data rows, columns, row_count, and truncated flag.
    """
    try:
        safe_sql = _validate_sql(sql)
    except ValueError as exc:
        return _error_payload(sql, str(exc))

    conn = _get_connection()
    if conn is None:
        return _error_payload(safe_sql, _connection_error or "Database connection unavailable.")

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
            cursor.execute(safe_sql)
            rows = cursor.fetchall()
            columns = [desc.name for desc in cursor.description or []]
    except Exception as exc:
        logger.warning("pg_query MCP query failed: %s", exc)
        return _error_payload(safe_sql, str(exc))

    data = [dict(row) for row in rows[:MAX_ROWS]]
    payload = {
        "kind": "pg_query",
        "sql": safe_sql,
        "data": data,
        "columns": columns,
        "row_count": len(data),
        "truncated": len(rows) > MAX_ROWS,
    }
    return json.dumps(payload, ensure_ascii=False, default=_json_default)


@mcp.tool()
def list_tables() -> str:
    """List the whitelisted mobility demo tables and columns."""
    payload = {
        "kind": "pg_schema",
        "tables": [
            {
                "name": "stations",
                "description": "Shanghai shared mobility stations and operating areas.",
                "columns": [
                    "id",
                    "name",
                    "district",
                    "address",
                    "lat",
                    "lng",
                    "capacity",
                    "station_type",
                ],
            },
            {
                "name": "vehicle_distribution",
                "description": "Hourly vehicle inventory snapshots by station.",
                "columns": [
                    "id",
                    "station_id",
                    "bike_count",
                    "ebike_count",
                    "scooter_count",
                    "total_count",
                    "recorded_at",
                ],
            },
            {
                "name": "orders",
                "description": "Ride orders with pickup and dropoff station references.",
                "columns": [
                    "id",
                    "user_id",
                    "vehicle_type",
                    "pickup_station_id",
                    "dropoff_station_id",
                    "amount",
                    "duration_minutes",
                    "created_at",
                ],
            },
            {
                "name": "weather",
                "description": "Daily weather near each station.",
                "columns": [
                    "id",
                    "station_id",
                    "date",
                    "weather_type",
                    "temperature",
                    "precipitation_mm",
                    "wind_speed",
                ],
            },
            {
                "name": "demand_forecast",
                "description": "Hourly predicted demand by station.",
                "columns": [
                    "id",
                    "station_id",
                    "forecast_date",
                    "hour",
                    "predicted_demand",
                    "confidence",
                    "model_version",
                ],
            },
        ],
    }
    return json.dumps(payload, ensure_ascii=False)


if __name__ == "__main__":
    _get_connection()
    mcp.run()
