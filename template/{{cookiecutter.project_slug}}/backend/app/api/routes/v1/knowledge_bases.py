{%- if cookiecutter.enable_teams and cookiecutter.enable_rag and cookiecutter.use_jwt %}
"""Knowledge Base routes — CRUD + per-KB document upload + sync sources.

Document upload and sync-source management are wired here (rather than under
``/rag``) so non-admin owners can manage their own KB without needing the
app-admin role required by the bulk ``/rag`` endpoints.
"""

from typing import Any

{%- if cookiecutter.use_postgresql %}
from uuid import UUID
{%- endif %}

from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.deps import (
    ActiveOrg,
    CurrentRequirementDemoWriter,
    CurrentUser,
    KnowledgeBaseSvc,
    RequirementDemoRole,
)
{%- if cookiecutter.use_postgresql or cookiecutter.use_sqlite %}
from app.api.deps import RAGDocumentSvc, SyncSourceSvc, VectorStoreSvc  # noqa: F401
{%- endif %}
{%- if cookiecutter.use_postgresql %}
from app.api.deps import RequirementQuerySvc, RequirementWorkflowSvc
{%- endif %}
from app.core.exceptions import NotFoundError
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate,
    KnowledgeBaseList,
    KnowledgeBaseRead,
    KnowledgeBaseUpdate,
)
{%- if cookiecutter.use_postgresql or cookiecutter.use_sqlite %}
from app.schemas.rag import (
{%- if cookiecutter.use_postgresql %}
    RequirementBreakdownResponse,
    RequirementChangeRequest,
    RequirementChangeResponse,
    RequirementDocumentDiffResponse,
    RequirementDocumentVersionList,
    RequirementIntakeRequest,
    RequirementIntakeResponse,
    RequirementQueryRequest,
    RequirementQueryResponse,
{%- endif %}
    RAGIngestResponse,
    RAGSyncResponse,
    RAGTrackedDocumentList,
)
{%- if cookiecutter.use_postgresql %}
from app.services.agent import agent_connection_manager
{%- endif %}
from app.schemas.sync_source import (
    ConnectorList,
    SyncSourceCreate,
    SyncSourceList,
    SyncSourceRead,
)
{%- endif %}

router = APIRouter()


{%- if cookiecutter.use_postgresql %}


async def _broadcast_requirement_event(
    response: RequirementIntakeResponse | RequirementChangeResponse,
) -> None:
    """Fan out requirement workflow notifications to connected WS clients."""
    if response.notification_event is None:
        return
    await agent_connection_manager.broadcast_event(
        "requirement_notification",
        response.notification_event.model_dump(),
    )


@router.get("/", response_model=KnowledgeBaseList)
async def list_knowledge_bases(
    service: KnowledgeBaseSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """List all Knowledge Bases accessible to the current user in this org context."""
    items = await service.list_accessible(
        user_id=current_user.id,
        organization_id=active_org.id,
    )
    return KnowledgeBaseList(items=items, total=len(items))


@router.post("/", response_model=KnowledgeBaseRead, status_code=status.HTTP_201_CREATED)
async def create_knowledge_base(
    data: KnowledgeBaseCreate,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Create a new Knowledge Base.

    - ``personal`` scope: visible only to you
    - ``org`` scope: visible to all members of the active org (admin/owner only)
    - ``app`` scope: visible to all users (app admin only)
    """
    return await service.create(
        data,
        user_id=current_user.id,
        organization_id=active_org.id,
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.get("/{kb_id}", response_model=KnowledgeBaseRead)
async def get_knowledge_base(
    kb_id: UUID,
    service: KnowledgeBaseSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """Get a Knowledge Base by ID."""
    return await service.get(
        kb_id,
        user_id=current_user.id,
        organization_id=active_org.id,
    )


@router.patch("/{kb_id}", response_model=KnowledgeBaseRead)
async def update_knowledge_base(
    kb_id: UUID,
    data: KnowledgeBaseUpdate,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Update name or description of a Knowledge Base."""
    return await service.update(
        kb_id,
        data,
        user_id=current_user.id,
        organization_id=active_org.id,
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_knowledge_base(
    kb_id: UUID,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> None:
    """Delete a Knowledge Base. Default KBs cannot be deleted."""
    await service.delete(
        kb_id,
        user_id=current_user.id,
        organization_id=active_org.id,
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.get("/{kb_id}/documents", response_model=RAGTrackedDocumentList)
async def list_kb_documents(
    kb_id: UUID,
    service: KnowledgeBaseSvc,
    rag_doc_service: RAGDocumentSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """List documents ingested into a Knowledge Base."""
    await service.get(kb_id, user_id=current_user.id, organization_id=active_org.id)
    return await rag_doc_service.list_for_kb(kb_id=kb_id, skip=skip, limit=limit)


@router.post(
    "/{kb_id}/documents",
    response_model=RAGIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_kb_document(
    kb_id: UUID,
    service: KnowledgeBaseSvc,
    rag_doc_service: RAGDocumentSvc,
    vector_store: VectorStoreSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
    file: UploadFile = File(...),
    replace: bool = Query(False),
) -> Any:
    """Upload a file into the KB's underlying vector collection.

    Auth is per-KB (owner / org member / admin) — unlike the bulk
    ``/rag/{collection}/documents`` endpoint which is admin-only — so a
    workspace user can manage their own KB without elevation.
    """
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    data = await file.read()
    return await rag_doc_service.dispatch_upload(
        collection_name=kb.collection_name,
        file_data=data,
        filename=file.filename or "unknown",
        replace=replace,
        vector_store=vector_store,
        organization_id=active_org.id,
        knowledge_base_id=kb.id,
        modified_by=current_user.id,
    )


@router.post("/{kb_id}/query", response_model=RequirementQueryResponse)
async def query_kb_requirements(
    kb_id: UUID,
    data: RequirementQueryRequest,
    service: KnowledgeBaseSvc,
    requirement_query_service: RequirementQuerySvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    requirement_role: RequirementDemoRole,
) -> Any:
    """Query a KB and return answers grounded in stored requirement Markdown."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    return await requirement_query_service.query_kb(
        kb_id=kb.id,
        collection_name=kb.collection_name,
        query=data.query,
        role=data.role or requirement_role,
        limit=data.limit,
        min_score=data.min_score,
    )


@router.post(
    "/{kb_id}/requirements/from-text",
    response_model=RequirementIntakeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_requirement_from_text(
    kb_id: UUID,
    data: RequirementIntakeRequest,
    service: KnowledgeBaseSvc,
    workflow_service: RequirementWorkflowSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Create a Markdown requirement document from a one-sentence description."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    response = await workflow_service.create_from_text(
        kb=kb,
        description=data.description,
        title=data.title,
        filename=data.filename,
        user_id=current_user.id,
        organization_id=active_org.id,
    )
    await _broadcast_requirement_event(response)
    return response


@router.get(
    "/{kb_id}/documents/{doc_id}/breakdown",
    response_model=RequirementBreakdownResponse,
)
async def break_down_requirement_document(
    kb_id: UUID,
    doc_id: UUID,
    service: KnowledgeBaseSvc,
    workflow_service: RequirementWorkflowSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    requirement_role: RequirementDemoRole,
) -> Any:
    """Break down one requirement document with section-level citations."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    return await workflow_service.break_down_document(
        kb_id=kb.id,
        doc_id=doc_id,
        role=requirement_role,
    )


@router.get(
    "/{kb_id}/documents/{doc_id}/versions",
    response_model=RequirementDocumentVersionList,
)
async def list_requirement_document_versions(
    kb_id: UUID,
    doc_id: UUID,
    service: KnowledgeBaseSvc,
    workflow_service: RequirementWorkflowSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """List the version history for one requirement document chain."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    return await workflow_service.list_document_versions(kb_id=kb.id, doc_id=doc_id)


@router.get(
    "/{kb_id}/documents/{doc_id}/diff",
    response_model=RequirementDocumentDiffResponse,
)
async def diff_requirement_document_versions(
    kb_id: UUID,
    doc_id: UUID,
    service: KnowledgeBaseSvc,
    workflow_service: RequirementWorkflowSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    from_version: int | None = Query(None, ge=1),
    to_version: int | None = Query(None, ge=1),
) -> Any:
    """Compare two versions in one requirement document chain."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    return await workflow_service.diff_document_versions(
        kb_id=kb.id,
        doc_id=doc_id,
        from_version=from_version,
        to_version=to_version,
    )


@router.post(
    "/{kb_id}/documents/{doc_id}/change",
    response_model=RequirementChangeResponse,
)
async def change_requirement_document(
    kb_id: UUID,
    doc_id: UUID,
    data: RequirementChangeRequest,
    service: KnowledgeBaseSvc,
    workflow_service: RequirementWorkflowSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    requirement_role: RequirementDemoRole,
) -> Any:
    """Suggest, draft, or apply a requirement document change by role."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    response = await workflow_service.change_document(
        kb_id=kb.id,
        doc_id=doc_id,
        instruction=data.instruction,
        apply=data.apply,
        user_id=current_user.id,
        role=requirement_role,
        is_app_admin=False,
    )
    await _broadcast_requirement_event(response)
    return response


@router.post(
    "/{kb_id}/documents/{doc_id}/apply-draft",
    response_model=RequirementChangeResponse,
)
async def apply_requirement_draft(
    kb_id: UUID,
    doc_id: UUID,
    service: KnowledgeBaseSvc,
    workflow_service: RequirementWorkflowSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    requirement_role: RequirementDemoRole,
) -> Any:
    """Approve a draft requirement document and make it the latest version."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    response = await workflow_service.apply_draft(
        kb_id=kb.id,
        draft_doc_id=doc_id,
        user_id=current_user.id,
        role=requirement_role,
        is_app_admin=False,
    )
    await _broadcast_requirement_event(response)
    return response


@router.delete(
    "/{kb_id}/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_kb_document(
    kb_id: UUID,
    doc_id: UUID,
    service: KnowledgeBaseSvc,
    rag_doc_service: RAGDocumentSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Remove a document from the KB (cascades to vectors + file storage).

    Verifies the doc actually belongs to this KB's collection — without that
    check a KB owner could pass any doc_id and remove docs from KBs they
    don't own.
    """
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    doc = await rag_doc_service.get_document(str(doc_id))
    if doc.collection_name != kb.collection_name:
        raise NotFoundError(
            message="Document not found in this knowledge base",
            details={"kb_id": str(kb_id), "doc_id": str(doc_id)},
        )
    await rag_doc_service.delete_document(str(doc_id))
    return None


# ─── Sync sources scoped to a KB ──────────────────────────────────────────
#
# These mirror /rag/sync/sources but with per-KB auth (a personal KB owner
# can wire up a Google Drive folder without admin role) and automatically
# pin the source to ``kb.collection_name`` so the user can't accidentally
# point a sync at a different collection.


@router.get("/{kb_id}/sync-sources", response_model=SyncSourceList)
async def list_kb_sync_sources(
    kb_id: UUID,
    service: KnowledgeBaseSvc,
    sync_source_svc: SyncSourceSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """List sync sources feeding this KB's collection."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    all_sources = await sync_source_svc.list_sources()
    items = [s for s in all_sources.items if s.collection_name == kb.collection_name]
    return SyncSourceList(items=items, total=len(items))


@router.post(
    "/{kb_id}/sync-sources",
    response_model=SyncSourceRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_kb_sync_source(
    kb_id: UUID,
    data: SyncSourceCreate,
    service: KnowledgeBaseSvc,
    sync_source_svc: SyncSourceSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Wire up a sync source (Google Drive, S3, …) feeding this KB.

    The ``collection_name`` field on the request body is overridden with the
    KB's own collection — clients should not need to know that detail.
    """
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    payload = data.model_copy(update={"collection_name": kb.collection_name})
    return await sync_source_svc.create_source(payload)


@router.post(
    "/{kb_id}/sync-sources/{source_id}/trigger",
    response_model=RAGSyncResponse,
)
async def trigger_kb_sync_source(
    kb_id: UUID,
    source_id: UUID,
    service: KnowledgeBaseSvc,
    sync_source_svc: SyncSourceSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Manually trigger a sync run for one of this KB's sources."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    source = await sync_source_svc.get_source(str(source_id))
    if source.collection_name != kb.collection_name:
        raise NotFoundError(
            message="Sync source not found in this knowledge base",
            details={"kb_id": str(kb_id), "source_id": str(source_id)},
        )
    sync_log = await sync_source_svc.trigger_sync(str(source_id))
    return RAGSyncResponse(
        id=str(sync_log.id),
        status="running",
        message=f"Sync triggered for source '{source_id}'",
    )


@router.delete(
    "/{kb_id}/sync-sources/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_kb_sync_source(
    kb_id: UUID,
    source_id: UUID,
    service: KnowledgeBaseSvc,
    sync_source_svc: SyncSourceSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Remove a sync source from this KB."""
    kb = await service.get(
        kb_id, user_id=current_user.id, organization_id=active_org.id
    )
    source = await sync_source_svc.get_source(str(source_id))
    if source.collection_name != kb.collection_name:
        raise NotFoundError(
            message="Sync source not found in this knowledge base",
            details={"kb_id": str(kb_id), "source_id": str(source_id)},
        )
    await sync_source_svc.delete_source(str(source_id))
    return None


@router.get("/{kb_id}/sync-sources/connectors", response_model=ConnectorList)
async def list_kb_connectors(
    kb_id: UUID,
    service: KnowledgeBaseSvc,
    sync_source_svc: SyncSourceSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """List available connector types (Google Drive, S3, …) for this KB."""
    await service.get(kb_id, user_id=current_user.id, organization_id=active_org.id)
    return sync_source_svc.list_connectors()


{%- elif cookiecutter.use_sqlite %}


@router.get("/", response_model=KnowledgeBaseList)
def list_knowledge_bases(
    service: KnowledgeBaseSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """List all Knowledge Bases accessible to the current user in this org context."""
    items = service.list_accessible(
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
    )
    return KnowledgeBaseList(items=items, total=len(items))


@router.post("/", response_model=KnowledgeBaseRead, status_code=status.HTTP_201_CREATED)
def create_knowledge_base(
    data: KnowledgeBaseCreate,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Create a new Knowledge Base."""
    return service.create(
        data,
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.get("/{kb_id}", response_model=KnowledgeBaseRead)
def get_knowledge_base(
    kb_id: str,
    service: KnowledgeBaseSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """Get a Knowledge Base by ID."""
    return service.get(
        kb_id,
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
    )


@router.patch("/{kb_id}", response_model=KnowledgeBaseRead)
def update_knowledge_base(
    kb_id: str,
    data: KnowledgeBaseUpdate,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Update name or description of a Knowledge Base."""
    return service.update(
        kb_id,
        data,
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_knowledge_base(
    kb_id: str,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> None:
    """Delete a Knowledge Base. Default KBs cannot be deleted."""
    service.delete(
        kb_id,
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.get("/{kb_id}/documents", response_model=RAGTrackedDocumentList)
def list_kb_documents(
    kb_id: str,
    service: KnowledgeBaseSvc,
    rag_doc_service: RAGDocumentSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """List documents ingested into a Knowledge Base."""
    service.get(kb_id, user_id=str(current_user.id), organization_id=str(active_org.id))
    return rag_doc_service.list_for_kb(kb_id=kb_id, skip=skip, limit=limit)


{%- elif cookiecutter.use_mongodb %}


@router.get("/", response_model=KnowledgeBaseList)
async def list_knowledge_bases(
    service: KnowledgeBaseSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """List all Knowledge Bases accessible to the current user in this org context."""
    items = await service.list_accessible(
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
    )
    return KnowledgeBaseList(items=items, total=len(items))


@router.post("/", response_model=KnowledgeBaseRead, status_code=status.HTTP_201_CREATED)
async def create_knowledge_base(
    data: KnowledgeBaseCreate,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Create a new Knowledge Base."""
    return await service.create(
        data,
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.get("/{kb_id}", response_model=KnowledgeBaseRead)
async def get_knowledge_base(
    kb_id: str,
    service: KnowledgeBaseSvc,
    current_user: CurrentUser,
    active_org: ActiveOrg,
) -> Any:
    """Get a Knowledge Base by ID."""
    return await service.get(kb_id, user_id=str(current_user.id), organization_id=str(active_org.id))


@router.patch("/{kb_id}", response_model=KnowledgeBaseRead)
async def update_knowledge_base(
    kb_id: str,
    data: KnowledgeBaseUpdate,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> Any:
    """Update name or description of a Knowledge Base."""
    return await service.update(
        kb_id, data,
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


@router.delete("/{kb_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_knowledge_base(
    kb_id: str,
    service: KnowledgeBaseSvc,
    current_user: CurrentRequirementDemoWriter,
    active_org: ActiveOrg,
) -> None:
    """Delete a Knowledge Base. Default KBs cannot be deleted."""
    await service.delete(
        kb_id,
        user_id=str(current_user.id),
        organization_id=str(active_org.id),
        is_app_admin=getattr(current_user, "is_app_admin", False),
    )


{%- endif %}
{%- else %}
"""Knowledge Base routes — not configured."""
{%- endif %}
