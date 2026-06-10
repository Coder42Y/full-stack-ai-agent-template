"""Web Search MCP Server -- 提供 web_search 工具.

通过 MCP 协议暴露 web search 能力,供 Agent 动态发现和调用.
使用 DuckDuckGo 搜索(无需 API Key),支持 Tavily 作为备选.

启动方式(stdio transport):
    python -m app.agents.mcp_servers.web_search_server

面试讲述点:
- MCP Server 独立进程,通过 stdio 通信
- 工具自描述(name / description / inputSchema),Client 无需硬编码
- 一个 MCP Server 可被多个 Agent / 应用复用
"""

import json
import logging

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

mcp = FastMCP("web-search")


@mcp.tool()
def web_search(query: str, max_results: int = 5) -> str:
    """Search the web for current information.

    Use when the user asks about recent events, facts, or topics
    not in your training data. Returns structured JSON with titles,
    URLs, and content snippets.

    Args:
        query: The search query string.
        max_results: Maximum number of results (1-10, default: 5).

    Returns:
        JSON string with search results.
    """
    # Strategy 1: Try DuckDuckGo (no API key needed)
    try:
        from duckduckgo_search import DDGS

        with DDGS() as ddgs:
            raw_results = list(ddgs.text(query, max_results=min(max_results, 10)))

        results = [
            {
                "title": r.get("title", "Untitled"),
                "url": r.get("href", ""),
                "content": (r.get("body") or "")[:500],
            }
            for r in raw_results
        ]

        if results:
            return json.dumps(
                {"kind": "web_search", "query": query, "results": results},
                ensure_ascii=False,
            )
    except ImportError:
        logger.debug("duckduckgo_search not available, trying Tavily")
    except Exception as e:
        logger.warning(f"DuckDuckGo search failed: {e}, trying Tavily")

    # Strategy 2: Try Tavily (requires API key)
    try:
        import os

        from tavily import TavilyClient

        api_key = os.environ.get("TAVILY_API_KEY", "")
        if api_key:
            client = TavilyClient(api_key=api_key)
            response = client.search(
                query=query,
                max_results=min(max_results, 10),
                search_depth="basic",
            )
            results = [
                {
                    "title": r.get("title", "Untitled"),
                    "url": r.get("url", ""),
                    "content": (r.get("content") or "")[:500],
                }
                for r in response.get("results", [])
            ]
            if results:
                return json.dumps(
                    {"kind": "web_search", "query": query, "results": results},
                    ensure_ascii=False,
                )
    except ImportError:
        logger.debug("tavily not available")
    except Exception as e:
        logger.warning(f"Tavily search failed: {e}")

    # All strategies failed
    return json.dumps(
        {
            "kind": "web_search",
            "query": query,
            "results": [],
            "error": "Web search unavailable: no search backend configured. "
            "Install duckduckgo-search or set TAVILY_API_KEY.",
        },
        ensure_ascii=False,
    )


if __name__ == "__main__":
    mcp.run()
