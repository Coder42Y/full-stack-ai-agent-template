{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt and cookiecutter.use_postgresql %}
"""Requirement notification fan-out.

Local WebSocket broadcasts keep the demo path simple. When Redis is enabled,
the same payload is also published to a pub/sub channel so every app process can
forward the event to its own connected WebSocket clients.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.core.audit import record_audit
from app.core.config import settings
from app.db.models.audit_log import AppAdminAuditLog
from app.schemas.rag import (
    RequirementNotificationEvent,
    RequirementNotificationItem,
    RequirementNotificationList,
)
from app.services.agent import agent_connection_manager

{%- if cookiecutter.enable_redis %}
import redis.asyncio as aioredis

{%- endif %}

logger = logging.getLogger(__name__)

REQUIREMENT_NOTIFICATION_EVENT = "requirement_notification"
REQUIREMENT_NOTIFICATION_CHANNEL = "requirement_notifications"
REQUIREMENT_NOTIFICATION_CREATED = "requirement.notification_created"
REQUIREMENT_NOTIFICATION_READ = "requirement.notification_read"


async def publish_requirement_event(
    event: RequirementNotificationEvent | None,
) -> int:
    """Broadcast a requirement event locally and publish it cross-process."""
    if event is None:
        return 0

    payload = event.model_dump()
    delivered = await agent_connection_manager.broadcast_event(
        REQUIREMENT_NOTIFICATION_EVENT,
        payload,
    )
{%- if cookiecutter.enable_redis %}
    try:
        client = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)  # type: ignore[no-untyped-call]
        try:
            await client.publish(REQUIREMENT_NOTIFICATION_CHANNEL, json.dumps(payload))
        finally:
            await client.aclose()
    except Exception as exc:
        logger.warning("Requirement notification Redis publish failed: %s", exc)
{%- endif %}
    return delivered


def _details_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _notification_item(
    entry: AppAdminAuditLog,
    *,
    read_at: str | None = None,
) -> RequirementNotificationItem | None:
    details = _details_dict(getattr(entry, "details", None))
    event_type = details.get("event_type")
    kb_id = details.get("knowledge_base_id")
    document_id = details.get("document_id")
    filename = details.get("filename")
    message = details.get("message")
    if not all(isinstance(value, str) for value in (event_type, kb_id, document_id, filename, message)):
        return None

    version = details.get("version")
    status = details.get("status")
    diff_summary = details.get("diff_summary")
    return RequirementNotificationItem(
        id=str(entry.id),
        event_type=event_type,
        kb_id=kb_id,
        document_id=document_id,
        filename=filename,
        message=message,
        version=version if isinstance(version, int) else None,
        status=status if isinstance(status, str) else None,
        diff_summary=diff_summary if isinstance(diff_summary, str) else None,
        actor_user_id=str(entry.actor_user_id),
        read=read_at is not None,
        created_at=entry.created_at.isoformat()
        if getattr(entry, "created_at", None)
        else None,
        read_at=read_at,
    )


async def persist_requirement_notification(
    db,
    *,
    event: RequirementNotificationEvent | None,
    actor_user_id: UUID,
    organization_id: UUID | None = None,
    mark_actor_read: bool = True,
) -> AppAdminAuditLog | None:
    """Persist a requirement notification and optionally mark it read for the actor."""
    if event is None:
        return None

    entry = await record_audit(
        db,
        actor_user_id=actor_user_id,
        action=REQUIREMENT_NOTIFICATION_CREATED,
        organization_id=organization_id,
        target_type="rag_document",
        target_id=event.document_id,
        details={
            "knowledge_base_id": event.kb_id,
            "document_id": event.document_id,
            "event_type": event.event_type,
            "filename": event.filename,
            "message": event.message,
            "version": event.version,
            "status": event.status,
            "diff_summary": event.diff_summary,
        },
    )
    if entry is not None and mark_actor_read:
        await mark_requirement_notification_read(
            db,
            notification_id=entry.id,
            user_id=actor_user_id,
            organization_id=organization_id,
        )
    return entry


async def list_requirement_notifications(
    db,
    *,
    kb_id: UUID,
    user_id: UUID,
    organization_id: UUID | None = None,
    limit: int = 50,
) -> RequirementNotificationList:
    """List persisted requirement notifications with current user's read state."""
    read_stmt = select(AppAdminAuditLog).where(
        AppAdminAuditLog.action == REQUIREMENT_NOTIFICATION_READ,
        AppAdminAuditLog.actor_user_id == user_id,
    )
    if organization_id is not None:
        read_stmt = read_stmt.where(AppAdminAuditLog.organization_id == organization_id)
    read_result = await db.execute(read_stmt)
    read_rows = read_result.scalars().all()
    read_at_by_id: dict[str, str] = {}
    for read_entry in read_rows:
        details = _details_dict(getattr(read_entry, "details", None))
        notification_id = details.get("notification_id")
        if isinstance(notification_id, str):
            read_at_by_id[notification_id] = (
                read_entry.created_at.isoformat()
                if getattr(read_entry, "created_at", None)
                else ""
            )

    stmt = (
        select(AppAdminAuditLog)
        .where(AppAdminAuditLog.action == REQUIREMENT_NOTIFICATION_CREATED)
        .order_by(AppAdminAuditLog.created_at.desc())
        .limit(min(max(limit * 3, limit), 150))
    )
    if organization_id is not None:
        stmt = stmt.where(AppAdminAuditLog.organization_id == organization_id)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    items: list[RequirementNotificationItem] = []
    unread_count = 0
    for entry in rows:
        details = _details_dict(getattr(entry, "details", None))
        if details.get("knowledge_base_id") != str(kb_id):
            continue
        read_at = read_at_by_id.get(str(entry.id))
        item = _notification_item(entry, read_at=read_at)
        if item is None:
            continue
        if not item.read:
            unread_count += 1
        items.append(item)
        if len(items) >= limit:
            break

    return RequirementNotificationList(
        items=items,
        total=len(items),
        unread_count=unread_count,
    )


async def mark_requirement_notification_read(
    db,
    *,
    notification_id: UUID,
    user_id: UUID,
    organization_id: UUID | None = None,
) -> None:
    """Persist a user's read receipt for one notification."""
    existing_stmt = select(AppAdminAuditLog).where(
        AppAdminAuditLog.action == REQUIREMENT_NOTIFICATION_READ,
        AppAdminAuditLog.actor_user_id == user_id,
    )
    if organization_id is not None:
        existing_stmt = existing_stmt.where(AppAdminAuditLog.organization_id == organization_id)
    existing = await db.execute(existing_stmt)
    for row in existing.scalars().all():
        details = _details_dict(getattr(row, "details", None))
        if details.get("notification_id") == str(notification_id):
            return

    await record_audit(
        db,
        actor_user_id=user_id,
        action=REQUIREMENT_NOTIFICATION_READ,
        organization_id=organization_id,
        target_type="requirement_notification",
        target_id=str(notification_id),
        details={"notification_id": str(notification_id)},
    )


async def mark_all_requirement_notifications_read(
    db,
    *,
    kb_id: UUID,
    user_id: UUID,
    organization_id: UUID | None = None,
) -> int:
    """Mark all visible KB notifications as read for the current user."""
    notifications = await list_requirement_notifications(
        db,
        kb_id=kb_id,
        user_id=user_id,
        organization_id=organization_id,
        limit=100,
    )
    count = 0
    for item in notifications.items:
        if item.read:
            continue
        await mark_requirement_notification_read(
            db,
            notification_id=UUID(item.id),
            user_id=user_id,
            organization_id=organization_id,
        )
        count += 1
    return count


async def start_requirement_notification_listener() -> asyncio.Task[None] | None:
    """Start Redis listener for cross-process requirement notifications."""
{%- if cookiecutter.enable_redis %}
    task = asyncio.create_task(_listen_requirement_notifications())
    return task
{%- else %}
    return None
{%- endif %}


async def stop_requirement_notification_listener(task: asyncio.Task[None] | None) -> None:
    """Cancel the Redis notification listener if it was started."""
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


{%- if cookiecutter.enable_redis %}
async def _listen_requirement_notifications() -> None:
    client = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)  # type: ignore[no-untyped-call]
    pubsub = client.pubsub()
    await pubsub.subscribe(REQUIREMENT_NOTIFICATION_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            raw_data: Any = message.get("data")
            try:
                payload = json.loads(raw_data if isinstance(raw_data, str) else raw_data.decode())
            except Exception:
                logger.warning("Invalid requirement notification payload: %r", raw_data)
                continue
            await agent_connection_manager.broadcast_event(
                REQUIREMENT_NOTIFICATION_EVENT,
                payload,
            )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("Requirement notification Redis listener stopped: %s", exc)
    finally:
        try:
            await pubsub.unsubscribe(REQUIREMENT_NOTIFICATION_CHANNEL)
            await client.aclose()
        except Exception as exc:
            logger.debug("Requirement notification listener cleanup failed: %s", exc)
{%- endif %}
{%- else %}
"""Requirement notifications are not configured for this template combination."""
{%- endif %}
