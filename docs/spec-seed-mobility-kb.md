---
type: spec
scope: 功能点 — 运营知识库 seed 命令
phase: Phase 4
priority: P0
depends_on: spec-ops-manual.md（需要手册文件已存在）
created: 2026-06-10
---

# Spec：运营知识库 Seed 命令（seed_mobility_kb.py）

## 功能概述

创建 `seed_mobility_kb` CLI 命令，完成两件事：
1. 在 `knowledge_bases` 表创建一条 APP scope 的 KnowledgeBase 记录，指向 Milvus collection `mobility_ops`
2. 将 `backend/docs/mobility_ops_manual.md` 通过 RAG Ingestion 写入 Milvus

命令执行后，Milvus 中存在 `mobility_ops` collection 且有文档 chunk，`knowledge_bases` 表有对应记录。前端 KB 面板自动可见（APP scope），用户手动勾选激活即可。

## 新建文件

| 文件路径 | 说明 |
|---------|------|
| `ai_agent_test/backend/app/commands/seed_mobility_kb.py` | Seed 命令实现 |

## 不修改的文件

本 spec 不修改任何现有文件。seed 命令是完全自包含的新文件。

## 实现规格

### 命令签名

```
uv run ai_agent_test cmd seed-mobility-kb
```

无参数。幂等设计：重复执行不会报错，已存在的 KB 记录会跳过，已存在的文档会 replace 更新。

### 命令注册

使用骨架的 `@command` 装饰器自动注册：

```python
from app.commands import command, info, success

@command("seed-mobility-kb", help="Seed mobility operations knowledge base")
def seed_mobility_kb() -> None:
    ...
```

### 核心逻辑

命令需要按顺序完成以下步骤：

#### 步骤 1：创建 KnowledgeBase 记录

```python
async def _ensure_kb(db: AsyncSession) -> KnowledgeBase:
    """Create mobility_ops KB if not exists."""
```

- 查询 `knowledge_bases` 表，按 `collection_name = "mobility_ops"` 查找
- 如果已存在 → 直接返回该记录，打印 info "Knowledge base already exists"
- 如果不存在 → 创建新记录：
  - `name`: "共享出行运营知识库"
  - `description`: "共享出行运营手册、调度策略、应急预案等知识文档"
  - `collection_name`: "mobility_ops"（硬编码，不用 auto-derive）
  - `scope`: "app"（APP scope，所有用户可见）
  - `owner_user_id`: None（APP scope 不需要 owner）
  - `organization_id`: None（APP scope 不属于任何 org）
  - `is_default`: False

**关键点**：APP scope 的 KB 创建需要绕过 `_check_create_permission` 里的 `is_app_admin` 检查。因为 seed 命令没有用户上下文。有两种做法：

| 方案 | 做法 | 推荐 |
|------|------|------|
| A. 直接用 repo | 调用 `knowledge_base_repo.create()` 绕过 service 层权限检查 | ✅ 推荐，seed 命令本身就是管理员操作 |
| B. 用 service + mock | 传 `is_app_admin=True` | 也可以，但需要构造假的 user_id |

**推荐方案 A**：直接用 `knowledge_base_repo.create()`。参考 `seed_prompts.py` 的做法——它也是直接操作数据库，不通过 service 层。

#### 步骤 2：Ingest 文档到 Milvus

```python
async def _ingest_manual(collection: str) -> None:
    """Ingest mobility_ops_manual.md into Milvus."""
```

- 获取 RAG 服务实例（复用 `rag.py` 中的 `get_rag_services()` 函数）：
  ```python
  from app.commands.rag import get_rag_services, ingest_path_async

  _, vector_store, processor, _, ingestion = get_rag_services()
  ```
- 调用 `ingest_path_async` ingest 手册文件：
  ```python
  manual_path = Path(__file__).resolve().parent.parent.parent / "docs" / "mobility_ops_manual.md"
  await ingest_path_async(
      str(manual_path),
      collection="mobility_ops",
      recursive=False,
      vector_store=vector_store,
      processor=processor,
      ingestion=ingestion,
      replace=True,
      sync_mode="full",
  )
  ```

- 打印成功信息：`success("Ingested mobility_ops_manual.md into collection 'mobility_ops'")`

#### 步骤 3：验证

```python
async def _verify(vector_store: BaseVectorStore) -> None:
    """Verify collection has documents."""
```

- 用 `vector_store.get_collection_stats("mobility_ops")` 检查 collection 是否有数据
- 打印文档数量

### 完整命令结构

```python
@command("seed-mobility-kb", help="Seed mobility operations knowledge base")
def seed_mobility_kb() -> None:
    """Create KB record and ingest mobility ops manual."""

    async def _seed() -> None:
        # Step 1: Create KB record
        async with get_db_context() as db:
            kb = await _ensure_kb(db)
            info(f"Knowledge base: id={kb.id}, collection={kb.collection_name}")

        # Step 2: Ingest document
        _, vector_store, processor, _, ingestion = get_rag_services()
        await _ingest_manual(vector_store, processor, ingestion)

        # Step 3: Verify
        await _verify(vector_store)
        success("Mobility operations knowledge base seeded successfully.")

    asyncio.run(_seed())
```

### 需要的 import

```python
import asyncio
from pathlib import Path

import click
from sqlalchemy import select

from app.commands import command, info, success, warning
from app.commands.rag import get_rag_services, ingest_path_async
from app.db.models.knowledge_base import KnowledgeBase
from app.db.session import get_db_context
```

### 错误处理

- `mobility_ops_manual.md` 文件不存在 → `raise click.ClickException("...")`
- Milvus 连接失败 → 捕获异常，打印 error，建议检查 Milvus 是否运行
- Embedding API 失败 → 捕获异常，打印 error，建议检查 API key
- KB 记录创建失败 → 让异常自然抛出，click 会显示错误信息

### 幂等性

- KB 记录：按 `collection_name` 查找，已存在则跳过
- 文档 ingest：`replace=True`，重复执行会更新已有文档

## 依赖关系

| 依赖 | 来源 |
|------|------|
| `mobility_ops_manual.md` 文件 | 本 spec 的前置 spec（spec-ops-manual.md） |
| `get_db_context()` | `app/db/session.py` |
| `knowledge_base_repo` | `app/repositories/knowledge_base.py` |
| `get_rag_services()` / `ingest_path_async()` | `app/commands/rag.py` |
| `KnowledgeBase` 模型 | `app/db/models/knowledge_base.py` |
| Milvus 运行 | Docker container，localhost:19530 |
| Embedding API | GLM/ZhipuAI，环境变量已配置 |

## 参考实现

参考 `seed_prompts.py` 的模式：
- 用 `asyncio.run()` 包裹异步逻辑
- 用 `get_db_context()` 获取数据库会话
- 用 `@command` 装饰器注册
- 用 `info/success/warning` 打印进度

参考 `rag.py` 的 `rag_ingest` 命令：
- 用 `get_rag_services()` 获取 RAG 组件
- 用 `ingest_path_async()` 执行 ingest

## 验收标准

1. 文件创建在 `ai_agent_test/backend/app/commands/seed_mobility_kb.py`
2. `uv run ai_agent_test cmd seed-mobility-kb` 执行成功，无报错
3. 执行后 `knowledge_bases` 表新增一条记录：
   - `name = "共享出行运营知识库"`
   - `collection_name = "mobility_ops"`
   - `scope = "app"`
4. 执行后 Milvus 有 `mobility_ops` collection 且有文档 chunks
5. CLI 验证通过：
   ```bash
   uv run ai_agent_test rag-search "暴雨天调运策略" --collection mobility_ops
   ```
   能返回手册中的相关内容
6. 重复执行不报错（幂等性）
7. `ruff check` 和 `ruff format --check` 通过
8. `py_compile` 通过
