---
type: spec
source: ../prd.md
created: 2026-06-11
status: in_progress
scope: 需求知识库 — M0 基础模型与权限底座
priority: P0
---

# Spec：M0 基础模型与权限底座

## 功能概述

为需求知识库系统补齐数据模型和角色基础，使后续文档上传、版本管理、修改审批和通知都能在同一套字段上工作。

## 数据模型

### `rag_documents`

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `markdown_content` | `TEXT` nullable | 文档转换后的完整 Markdown 内容 |
| `version` | `INTEGER` default 1 | 文档版本号 |
| `is_latest` | `BOOLEAN` default true | 是否为当前最新版本 |
| `previous_version_id` | FK -> `rag_documents.id` nullable | 上一版本文档 |
| `modified_by` | FK -> `users.id` nullable | 最后修改人 |

索引：

- `ix_rag_documents_is_latest`
- `ix_rag_documents_previous_version_id`
- `ix_rag_documents_modified_by`

### `knowledge_bases`

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `project_name` | `VARCHAR(255)` nullable | 项目名称，用于 UI 展示和项目级 KB 组织 |

### `UserRole`

扩展枚举：

```python
class UserRole(StrEnum):
    ADMIN = "admin"
    PRODUCT = "product"
    DEVELOPER = "developer"
    TESTER = "tester"
    USER = "user"
```

`admin` 仍拥有全部权限；其他角色默认同级，具体业务权限由后续 M7 权限服务控制。

## 文件结构

修改文件：

| 文件 | 说明 |
|------|------|
| `backend/app/db/models/rag_document.py` | 新增文档全文和版本字段 |
| `backend/app/db/models/knowledge_base.py` | 新增 `project_name` |
| `backend/app/db/models/user.py` | 扩展角色枚举 |
| `backend/app/schemas/rag.py` | 暴露版本元数据 |
| `backend/app/schemas/knowledge_base.py` | 暴露 `project_name` |
| `backend/app/schemas/user.py` | 扩展角色枚举 |
| `backend/app/repositories/rag_document.py` | 支持创建版本字段 |
| `backend/app/repositories/knowledge_base.py` | 支持 `project_name` 创建/更新 |
| `backend/app/services/rag_document.py` | list/create 贯通版本元数据 |
| `backend/app/services/knowledge_base.py` | create/update 贯通 `project_name` |

新增文件：

| 文件 | 说明 |
|------|------|
| `backend/alembic/versions/0022_req_kb_foundation.py` | 基础字段迁移 |

## 验收标准

1. 生成项目启用 RAG + SQL DB 时，迁移后 `rag_documents` 有完整新增字段。
2. `knowledge_bases` 有 `project_name` 字段。
3. API schema 可序列化 `version/is_latest/previous_version_id/modified_by/has_markdown_content`。
4. `UserRole` 接受 `product/developer/tester`。
5. 现有 admin/user 行为不破坏。
