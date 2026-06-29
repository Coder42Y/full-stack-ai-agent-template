{%- if cookiecutter.enable_rag and (cookiecutter.use_postgresql or cookiecutter.use_sqlite) %}
{%- if cookiecutter.use_postgresql %}
"""RAG document repository (PostgreSQL async).

Contains database operations for RAGDocument entities.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.rag_document import RAGDocument


async def get_by_id(db: AsyncSession, doc_id: UUID) -> RAGDocument | None:
    """Get a RAG document by ID."""
    return await db.get(RAGDocument, doc_id)


async def get_latest_by_vector_document_id(
    db: AsyncSession,
    *,
    collection_name: str,
    vector_document_id: str,
{%- if cookiecutter.enable_teams and cookiecutter.use_jwt %}
    knowledge_base_id: UUID | None = None,
{%- endif %}
) -> RAGDocument | None:
    """Get the latest SQL-tracked document matching a vector document ID."""
    query = select(RAGDocument).where(
        RAGDocument.collection_name == collection_name,
        RAGDocument.vector_document_id == vector_document_id,
        RAGDocument.is_latest.is_(True),
    )
{%- if cookiecutter.enable_teams and cookiecutter.use_jwt %}
    if knowledge_base_id is not None:
        query = query.where(RAGDocument.knowledge_base_id == knowledge_base_id)
{%- endif %}
    query = query.order_by(RAGDocument.version.desc(), RAGDocument.created_at.desc())
    result = await db.execute(query)
    return result.scalars().first()


async def get_latest_markdown_for_kb(
    db: AsyncSession,
    *,
    knowledge_base_id: UUID,
    collection_name: str,
) -> list[RAGDocument]:
    """Return latest KB documents that have stored Markdown originals."""
    query = (
        select(RAGDocument)
        .where(
            RAGDocument.knowledge_base_id == knowledge_base_id,
            RAGDocument.collection_name == collection_name,
            RAGDocument.is_latest.is_(True),
            RAGDocument.markdown_content.is_not(None),
        )
        .order_by(RAGDocument.created_at.desc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_latest_markdown_for_collection(
    db: AsyncSession,
    *,
    collection_name: str,
) -> list[RAGDocument]:
    """Return latest collection documents that have stored Markdown originals."""
    query = (
        select(RAGDocument)
        .where(
            RAGDocument.collection_name == collection_name,
            RAGDocument.is_latest.is_(True),
            RAGDocument.markdown_content.is_not(None),
        )
        .order_by(RAGDocument.created_at.desc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_all(
    db: AsyncSession,
    collection_name: str | None = None,
{%- if cookiecutter.enable_teams %}
    organization_id: UUID | None = None,
{%- endif %}
) -> list[RAGDocument]:
    """Get all RAG documents, optionally filtered by collection."""
    query = select(RAGDocument)
    if collection_name:
        query = query.where(RAGDocument.collection_name == collection_name)
{%- if cookiecutter.enable_teams %}
    if organization_id is not None:
        query = query.where(RAGDocument.organization_id == organization_id)
{%- endif %}
    query = query.order_by(RAGDocument.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


{%- if cookiecutter.enable_teams %}


async def get_for_kb(
    db: AsyncSession,
    kb_id: UUID,
    *,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[RAGDocument], int]:
    """Page through documents linked to a Knowledge Base. Returns (rows, total)."""
    base = select(RAGDocument).where(RAGDocument.knowledge_base_id == kb_id)
    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    rows = (
        await db.execute(
            base.order_by(RAGDocument.created_at.desc()).offset(skip).limit(limit)
        )
    ).scalars().all()
    return list(rows), int(total)
{%- endif %}


{%- if cookiecutter.enable_teams and cookiecutter.use_jwt %}
async def get_version_chain_for_document(
    db: AsyncSession,
    *,
    knowledge_base_id: UUID,
    document_id: UUID,
) -> list[RAGDocument]:
    """Return all versions connected to a requirement document."""
    doc = await db.get(RAGDocument, document_id)
    if doc is None or doc.knowledge_base_id != knowledge_base_id:
        return []

    root = doc
    seen_ids = {root.id}
    while root.previous_version_id is not None:
        previous = await db.get(RAGDocument, root.previous_version_id)
        if (
            previous is None
            or previous.knowledge_base_id != knowledge_base_id
            or previous.id in seen_ids
        ):
            break
        root = previous
        seen_ids.add(root.id)

    query = (
        select(RAGDocument)
        .where(
            RAGDocument.knowledge_base_id == knowledge_base_id,
            RAGDocument.filename == root.filename,
        )
        .order_by(RAGDocument.version.desc(), RAGDocument.created_at.desc())
    )
    result = await db.execute(query)
    chain = list(result.scalars().all())

    linked_ids = {root.id}
    changed = True
    while changed:
        changed = False
        for item in chain:
            if item.id in linked_ids:
                continue
            if item.previous_version_id in linked_ids:
                linked_ids.add(item.id)
                changed = True

    return [item for item in chain if item.id in linked_ids]


async def get_pending_drafts_for_kb(
    db: AsyncSession,
    *,
    knowledge_base_id: UUID,
) -> list[RAGDocument]:
    """Return draft requirement document versions waiting for product review."""
    query = (
        select(RAGDocument)
        .where(
            RAGDocument.knowledge_base_id == knowledge_base_id,
            RAGDocument.status == "draft",
        )
        .order_by(RAGDocument.created_at.desc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())
{%- endif %}


async def create(
    db: AsyncSession,
    *,
    collection_name: str,
    filename: str,
    filesize: int,
    filetype: str,
    storage_path: str,
    status: str = "processing",
    markdown_content: str | None = None,
    chunk_count: int = 0,
    version: int = 1,
    is_latest: bool = True,
    previous_version_id: UUID | None = None,
    modified_by: UUID | None = None,
    completed_at: Any = None,
{%- if cookiecutter.enable_teams %}
    organization_id: UUID | None = None,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.use_jwt %}
    knowledge_base_id: UUID | None = None,
{%- endif %}
) -> RAGDocument:
    """Create a new RAG document record."""
    doc = RAGDocument(
        collection_name=collection_name,
        filename=filename,
        filesize=filesize,
        filetype=filetype,
        storage_path=storage_path,
        status=status,
        markdown_content=markdown_content,
        chunk_count=chunk_count,
        version=version,
        is_latest=is_latest,
        previous_version_id=previous_version_id,
        modified_by=modified_by,
        completed_at=completed_at,
{%- if cookiecutter.enable_teams %}
        organization_id=organization_id,
{%- endif %}
{%- if cookiecutter.enable_teams and cookiecutter.use_jwt %}
        knowledge_base_id=knowledge_base_id,
{%- endif %}
    )
    db.add(doc)
    await db.flush()
    return doc


async def mark_not_latest(db: AsyncSession, doc_id: UUID) -> RAGDocument | None:
    """Mark a document version as historical."""
    doc = await db.get(RAGDocument, doc_id)
    if doc is None:
        return None
    doc.is_latest = False
    await db.flush()
    return doc


async def update_status(
    db: AsyncSession,
    doc_id: UUID,
    *,
    status: str,
    error_message: str | None = None,
    vector_document_id: str | None = None,
    chunk_count: int | None = None,
    completed_at: Any = None,
    markdown_content: str | None = None,
) -> RAGDocument | None:
    """Update the processing status of a RAG document."""
    doc = await db.get(RAGDocument, doc_id)
    if not doc:
        return None
    doc.status = status
    if error_message is not None:
        doc.error_message = error_message
    if vector_document_id is not None:
        doc.vector_document_id = vector_document_id
    if chunk_count is not None:
        doc.chunk_count = chunk_count
    if completed_at is not None:
        doc.completed_at = completed_at
    if markdown_content is not None:
        doc.markdown_content = markdown_content
    await db.flush()
    return doc


async def delete(db: AsyncSession, doc_id: UUID) -> bool:
    """Delete a RAG document by ID."""
    doc = await db.get(RAGDocument, doc_id)
    if not doc:
        return False
    await db.delete(doc)
    await db.flush()
    return True


async def delete_by_collection(db: AsyncSession, collection_name: str) -> int:
    """Delete all RAG document records for a collection. Returns affected row count."""
    from sqlalchemy import delete as sql_delete

    result = await db.execute(
        sql_delete(RAGDocument).where(RAGDocument.collection_name == collection_name)
    )
    await db.flush()
    return result.rowcount  # type: ignore[no-any-return, attr-defined]


{%- elif cookiecutter.use_sqlite %}
"""RAG document repository (SQLite sync).

Contains database operations for RAGDocument entities.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.rag_document import RAGDocument


def get_by_id(db: Session, doc_id: str) -> RAGDocument | None:
    """Get a RAG document by ID."""
    return db.get(RAGDocument, doc_id)


def get_latest_by_vector_document_id(
    db: Session,
    *,
    collection_name: str,
    vector_document_id: str,
) -> RAGDocument | None:
    """Get the latest SQL-tracked document matching a vector document ID."""
    query = select(RAGDocument).where(
        RAGDocument.collection_name == collection_name,
        RAGDocument.vector_document_id == vector_document_id,
        RAGDocument.is_latest.is_(True),
    ).order_by(RAGDocument.version.desc(), RAGDocument.created_at.desc())
    result = db.execute(query)
    return result.scalars().first()


def get_all(
    db: Session,
    collection_name: str | None = None,
{%- if cookiecutter.enable_teams %}
    organization_id: str | None = None,
{%- endif %}
) -> list[RAGDocument]:
    """Get all RAG documents, optionally filtered by collection."""
    query = select(RAGDocument)
    if collection_name:
        query = query.where(RAGDocument.collection_name == collection_name)
{%- if cookiecutter.enable_teams %}
    if organization_id is not None:
        query = query.where(RAGDocument.organization_id == organization_id)
{%- endif %}
    query = query.order_by(RAGDocument.created_at.desc())
    result = db.execute(query)
    return list(result.scalars().all())


def create(
    db: Session,
    *,
    collection_name: str,
    filename: str,
    filesize: int,
    filetype: str,
    storage_path: str,
    status: str = "processing",
    markdown_content: str | None = None,
    version: int = 1,
    is_latest: bool = True,
    previous_version_id: str | None = None,
    modified_by: str | None = None,
{%- if cookiecutter.enable_teams %}
    organization_id: str | None = None,
{%- endif %}
) -> RAGDocument:
    """Create a new RAG document record."""
    doc = RAGDocument(
        collection_name=collection_name,
        filename=filename,
        filesize=filesize,
        filetype=filetype,
        storage_path=storage_path,
        status=status,
        markdown_content=markdown_content,
        version=version,
        is_latest=is_latest,
        previous_version_id=previous_version_id,
        modified_by=modified_by,
{%- if cookiecutter.enable_teams %}
        organization_id=organization_id,
{%- endif %}
    )
    db.add(doc)
    db.flush()
    return doc


def update_status(
    db: Session,
    doc_id: str,
    *,
    status: str,
    error_message: str | None = None,
    vector_document_id: str | None = None,
    chunk_count: int | None = None,
    completed_at: Any = None,
    markdown_content: str | None = None,
) -> RAGDocument | None:
    """Update the processing status of a RAG document."""
    doc = db.get(RAGDocument, doc_id)
    if not doc:
        return None
    doc.status = status
    if error_message is not None:
        doc.error_message = error_message
    if vector_document_id is not None:
        doc.vector_document_id = vector_document_id
    if chunk_count is not None:
        doc.chunk_count = chunk_count
    if completed_at is not None:
        doc.completed_at = completed_at
    if markdown_content is not None:
        doc.markdown_content = markdown_content
    db.flush()
    return doc


def delete(db: Session, doc_id: str) -> bool:
    """Delete a RAG document by ID."""
    doc = db.get(RAGDocument, doc_id)
    if not doc:
        return False
    db.delete(doc)
    db.flush()
    return True


def delete_by_collection(db: Session, collection_name: str) -> int:
    """Delete all RAG document records for a collection. Returns affected row count."""
    from sqlalchemy import delete as sql_delete

    result = db.execute(
        sql_delete(RAGDocument).where(RAGDocument.collection_name == collection_name)
    )
    db.flush()
    return result.rowcount  # type: ignore[no-any-return, attr-defined]


{%- endif %}
{%- else %}
"""RAG document repository - not configured."""
{%- endif %}
