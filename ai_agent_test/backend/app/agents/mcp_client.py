"""MCP Client -- 连接 MCP Server,发现和调用工具.

管理多个 MCP Server 的 stdio 连接,提供统一的工具发现和调用接口.
通过 AsyncExitStack 管理 stdio transport 的生命周期.

面试讲述点:
- MCP Client 通过 stdio transport 启动 Server 子进程
- connect 时完成 MCP 协议握手(initialize)
- list_tools / call_tool 是 MCP 标准协议方法
- 所有 Server 连接在 app lifespan 中统一管理
"""

import logging
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

logger = logging.getLogger(__name__)


class MCPClientManager:
    """管理多个 MCP Server 的连接和工具调用.

    Usage::

        manager = MCPClientManager(server_configs)
        await manager.connect_all()
        tools = await manager.list_tools("web_search")
        result = await manager.call_tool("web_search", "web_search", {"query": "hello"})
        await manager.disconnect_all()
    """

    def __init__(self, server_configs: dict[str, dict[str, Any]]) -> None:
        self._server_configs = server_configs
        self._exit_stack = AsyncExitStack()
        self._sessions: dict[str, ClientSession] = {}

    @property
    def server_names(self) -> list[str]:
        """已配置的 MCP Server 名称列表."""
        return list(self._server_configs.keys())

    @property
    def sessions(self) -> dict[str, ClientSession]:
        """当前活跃的 MCP 会话."""
        return self._sessions

    async def connect(self, server_name: str) -> None:
        """启动 MCP Server 子进程并完成初始化握手.

        Args:
            server_name: 配置中的服务器名称.

        Raises:
            ValueError: 未知的服务器名称.
            RuntimeError: 连接或初始化失败.
        """
        if server_name not in self._server_configs:
            raise ValueError(f"Unknown MCP server: {server_name}")

        config = self._server_configs[server_name]

        # 构建 stdio 连接参数
        env_overrides = config.get("env")
        env = None
        if env_overrides:
            import os

            env = {**os.environ, **{k: v for k, v in env_overrides.items() if v}}

        params = StdioServerParameters(
            command=config.get("command", "python"),
            args=config.get("args", []),
            env=env,
        )

        try:
            # stdio_client 返回 (read_stream, write_stream)
            read, write = await self._exit_stack.enter_async_context(
                stdio_client(params)
            )

            # 创建 ClientSession 并初始化
            session = await self._exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await session.initialize()

            self._sessions[server_name] = session
            logger.info(f"MCP Server '{server_name}' connected and initialized")
        except Exception as e:
            logger.error(f"MCP Server '{server_name}' connection failed: {e}")
            raise RuntimeError(f"Failed to connect MCP server '{server_name}': {e}") from e

    async def connect_all(self) -> None:
        """连接所有已配置的 MCP Server."""
        for server_name in self._server_configs:
            try:
                await self.connect(server_name)
            except RuntimeError as e:
                # 单个 Server 连接失败不影响其他 Server
                logger.error(f"Skipping MCP server '{server_name}': {e}")

    async def list_tools(self, server_name: str) -> list[Any]:
        """发现指定 server 的所有可用工具.

        Args:
            server_name: 服务器名称.

        Returns:
            MCP Tool 对象列表.
        """
        session = self._sessions.get(server_name)
        if session is None:
            raise RuntimeError(f"MCP server '{server_name}' not connected")

        result = await session.list_tools()
        return result.tools

    async def call_tool(
        self, server_name: str, tool_name: str, arguments: dict[str, Any]
    ) -> Any:
        """调用指定 server 的工具.

        Args:
            server_name: 服务器名称.
            tool_name: 工具名称.
            arguments: 工具参数.

        Returns:
            工具调用结果(list of Content objects).
        """
        session = self._sessions.get(server_name)
        if session is None:
            raise RuntimeError(f"MCP server '{server_name}' not connected")

        result = await session.call_tool(tool_name, arguments)
        return result.content

    async def disconnect(self, server_name: str) -> None:
        """关闭指定 server 的连接.

        Note: 通过 AsyncExitStack 统一管理,单独 disconnect 不常用.
        """
        if server_name in self._sessions:
            del self._sessions[server_name]
            logger.info(f"MCP Server '{server_name}' disconnected")

    async def disconnect_all(self) -> None:
        """关闭所有 MCP Server 连接,释放资源."""
        try:
            await self._exit_stack.aclose()
        except Exception as e:
            logger.warning(f"Error closing MCP connections: {e}")
        finally:
            self._sessions.clear()
            logger.info("All MCP servers disconnected")
