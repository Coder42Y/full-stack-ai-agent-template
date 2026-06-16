---
type: spec
source: ../prd.md
created: 2026-06-11
status: implemented
scope: 需求知识库 — M8 WebSocket 变更通知
priority: P1
depends_on:
  - m5-change-management.md
  - m6-versioning.md
---

# Spec：M8 WebSocket 变更通知

## 功能概述

需求文档变更后，通过 WebSocket 向项目成员推送变更通知，包含修改人、文档名和 diff 摘要。

## 事件格式

```json
{
  "type": "requirement_changed",
  "payload": {
    "document_id": "...",
    "knowledge_base_id": "...",
    "filename": "V2.3_订单模块需求.docx",
    "version": 2,
    "modified_by": {"id": "...", "name": "产品经理"},
    "summary": "新增海外地址支持说明"
  }
}
```

## 文件范围

| 文件 | 说明 |
|------|------|
| `app/services/requirement_notification.py` | 生成通知 payload |
| `app/services/agent_session.py` | 复用 WebSocket 事件发送 |
| `frontend/src/hooks/use-websocket.ts` | 接收通知事件 |
| `frontend/src/app/[locale]/(dashboard)/settings/notifications/page.tsx` | 展示通知列表 |

## 当前实现状态

已完成 demo fan-out：

- 一句话入库、变更草稿、应用新版本、开发建议都会返回 `notification_event`。
- 事件包含 `event_type/kb_id/document_id/filename/message/version/status/diff_summary`。
- 后端复用现有 `/api/v1/ws/agent` 连接管理器广播 `requirement_notification`。
- 前端需求工作台建立 WebSocket 连接，收到同 KB 事件后写入“事件回执”并展示通知连接状态。

待实现增强：

- Redis/pubsub 跨进程广播。
- 独立通知中心、toast、已读状态。
- 按组织成员过滤，避免当前修改人重复收到自己触发的提示。

## 验收标准

1. 文档更新后项目成员收到 WebSocket 通知。
2. 通知包含 diff 摘要和版本号。
3. 当前修改人不重复收到自己触发的提示，或前端可去重。
4. WebSocket 不可用时，文档变更流程不失败。
