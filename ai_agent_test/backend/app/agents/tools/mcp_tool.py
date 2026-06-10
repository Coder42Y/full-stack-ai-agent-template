"""MCP Tool 桥接 -- 将 MCP tools 动态注册为 PydanticAI agent tools.

两阶段设计:
1. Phase 1 (async, lifespan startup): discover_mcp_tools() 从 MCP Server 发现工具并缓存
2. Phase 2 (sync, agent creation): register_cached_mcp_tools() 用缓存注册到 PydanticAI

这样避免了在同步 _register_tools 中调用 async 的问题.

面试讲述点:
- MCP 工具自描述:Client 不需要硬编码工具签名,从 Server 动态发现
- 动态函数生成:根据 MCP tool 的 JSON Schema 构建带正确类型注解的 Python 函数
- 两阶段设计:启动时 async 发现缓存,运行时 sync 注册,避免 async/sync 冲突
- 新增 MCP Server 后,Agent 自动获得新工具,无需改代码
"""

import inspect
import json
import logging
from typing import Any

from pydantic_ai import Agent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Phase 1 缓存:lifespan startup 时填充,agent 创建时读取
# ---------------------------------------------------------------------------

# 缓存结构:[(server_name, tool_name, description, inputSchema), ...]
_mcp_tool_cache: list[tuple[str, str, str, dict]] = []


async def discover_mcp_tools(mcp_manager: Any) -> list[str]:
    """从所有 MCP Server 发现工具并缓存到模块变量.

    在 FastAPI lifespan startup 阶段调用(async 环境,没有 event loop 问题).

    Args:
        mcp_manager: MCPClientManager 实例.

    Returns:
        发现的工具名称列表.
    """
    global _mcp_tool_cache
    _mcp_tool_cache = []
    discovered: list[str] = []

    for server_name in mcp_manager.server_names:
        try:
            tools = await mcp_manager.list_tools(server_name)
        except Exception as e:
            logger.error(f"MCP tool discovery failed for '{server_name}': {e}")
            continue

        for mcp_tool in tools:
            tool_name = mcp_tool.name
            description = getattr(mcp_tool, "description", "") or f"MCP tool: {tool_name}"
            schema = getattr(mcp_tool, "inputSchema", None) or {}
            _mcp_tool_cache.append((server_name, tool_name, description, schema))
            discovered.append(tool_name)
            logger.info(f"MCP tool discovered: {tool_name} (from {server_name})")

    return discovered


# ---------------------------------------------------------------------------
# Phase 2 注册:agent 创建时(sync)从缓存读取并注册
# ---------------------------------------------------------------------------


def register_cached_mcp_tools(agent: Agent, mcp_manager: Any) -> list[str]:
    """将缓存的 MCP tools 注册到 PydanticAI Agent(同步方法).

    在 AssistantAgent._register_tools() 中调用.
    依赖 discover_mcp_tools() 已经在 lifespan startup 时完成.

    Args:
        agent: PydanticAI Agent 实例.
        mcp_manager: MCPClientManager 实例(用于实际调用工具).

    Returns:
        注册的工具名称列表.
    """
    registered: list[str] = []

    for server_name, tool_name, description, schema in _mcp_tool_cache:
        try:
            fn = _build_typed_tool_function(
                tool_name=tool_name,
                description=description,
                schema=schema,
                mcp_manager=mcp_manager,
                server_name=server_name,
            )
            agent.tool_plain(name=f"mcp_{tool_name}", description=description)(fn)
            registered.append(tool_name)
            logger.info(f"MCP tool registered: mcp_{tool_name}")
        except Exception as e:
            logger.error(f"Failed to register MCP tool '{tool_name}': {e}")

    return registered


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------


def _format_mcp_result(result: Any) -> str:
    """Format MCP call_tool result into a string for the LLM."""
    if isinstance(result, str):
        return result
    if isinstance(result, list):
        # MCP tool results are lists of Content objects (TextContent, ImageContent, etc.)
        parts = []
        for item in result:
            if hasattr(item, "text"):
                parts.append(item.text)
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return json.dumps(result, ensure_ascii=False, default=str)


def _build_typed_tool_function(
    tool_name: str,
    description: str,
    schema: dict,
    mcp_manager: Any,
    server_name: str,
) -> Any:
    """根据 MCP tool 的 JSON Schema 动态创建带类型注解的异步函数.

    通过设置函数的 __signature__ 和 __annotations__,让 PydanticAI
    能正确推断参数类型并生成 LLM function calling schema.

    Args:
        tool_name: MCP 工具名称.
        description: 工具描述.
        schema: MCP tool 的 inputSchema(JSON Schema 格式).
        mcp_manager: MCP Client Manager 实例.
        server_name: MCP Server 名称.

    Returns:
        带类型注解的异步函数.
    """
    type_map = {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
    }

    properties = schema.get("properties", {})
    required = set(schema.get("required", []))

    # 构建 inspect.Parameter 列表
    params = []
    annotations: dict[str, type] = {}

    for pname, pdef in properties.items():
        ptype = type_map.get(pdef.get("type", "string"), str)
        annotations[pname] = ptype

        if pname in required:
            param = inspect.Parameter(
                pname,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=ptype,
            )
        else:
            default = pdef.get("default")
            param = inspect.Parameter(
                pname,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=ptype,
                default=default if default is not None else inspect.Parameter.empty,
            )
        params.append(param)

    # Closure variables -- 每个工具独立绑定
    _server_name = server_name
    _tool_name = tool_name
    _manager = mcp_manager

    async def _mcp_tool_wrapper(**kwargs: Any) -> str:
        raw = await _manager.call_tool(_server_name, _tool_name, kwargs)
        return _format_mcp_result(raw)

    # 设置函数元数据,让 PydanticAI 正确推断参数类型
    sig = inspect.Signature(params)
    _mcp_tool_wrapper.__signature__ = sig  # type: ignore[attr-defined]
    _mcp_tool_wrapper.__annotations__ = annotations
    _mcp_tool_wrapper.__name__ = f"mcp_{tool_name}"
    _mcp_tool_wrapper.__doc__ = description

    return _mcp_tool_wrapper
