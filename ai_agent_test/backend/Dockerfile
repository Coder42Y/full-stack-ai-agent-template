
# Build stage
FROM python:3.14-slim AS builder

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

# Copy application
COPY . /app

# Install project
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


# Runtime stage
FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
# LiteParse needs the Node.js CLI. Pre-installing here avoids a 30-60s
# blocking npm install on the first parse request from a fresh container.
# NOTE(local): apt 默认走 http://deb.debian.org，在 Docker Desktop 的 gvisor/vpnkit
# 网络下 HTTP 大文件下载会被 vpnkit 出站代理(127.0.0.1:1082)卡死；换成 HTTPS 的
# 阿里云镜像可绕开该问题（HTTPS 走直连，docker pull / pip 均正常）。
RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @llamaindex/liteparse \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app

# Add venv to path
ENV PATH="/app/.venv/bin:$PATH"

# Create non-root user and writable directories
RUN adduser --disabled-password --gecos "" appuser && \
    mkdir -p /app/media /app/data /app/chroma_data /app/models_cache && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/api/v1/health')" || exit 1

CMD ["python", "-m", "cli.commands", "server", "run", "--host", "0.0.0.0", "--port", "8000"]
