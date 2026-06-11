"""Seed the shared mobility operations knowledge base."""

import asyncio
from pathlib import Path

import click
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.commands import command, info, success
from app.commands.rag import get_rag_services, ingest_path_async
from app.db.models.knowledge_base import KBScope, KnowledgeBase
from app.db.session import get_db_context
from app.repositories import knowledge_base_repo
from app.services.rag.documents import DocumentProcessor
from app.services.rag.ingestion import IngestionService
from app.services.rag.vectorstore import BaseVectorStore

COLLECTION_NAME = "mobility_ops"
KB_NAME = "共享出行运营知识库"
KB_DESCRIPTION = "共享出行运营手册、调度策略、应急预案等知识文档"


async def _ensure_kb(db: AsyncSession) -> KnowledgeBase:
    """Create the mobility operations KB record if it does not exist."""
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.collection_name == COLLECTION_NAME)
    )
    kb = result.scalar_one_or_none()
    if kb is not None:
        info("Knowledge base already exists")
        return kb

    return await knowledge_base_repo.create(
        db,
        name=KB_NAME,
        description=KB_DESCRIPTION,
        collection_name=COLLECTION_NAME,
        scope=KBScope.APP.value,
        owner_user_id=None,
        organization_id=None,
        is_default=False,
    )


async def _ingest_manual(
    vector_store: BaseVectorStore,
    processor: DocumentProcessor,
    ingestion: IngestionService,
) -> None:
    """Ingest the mobility operations manual into Milvus."""
    manual_path = Path(__file__).resolve().parents[2] / "docs" / "mobility_ops_manual.md"
    if not manual_path.exists():
        raise click.ClickException(f"Manual file does not exist: {manual_path}")

    await ingest_path_async(
        str(manual_path),
        collection=COLLECTION_NAME,
        recursive=False,
        vector_store=vector_store,
        processor=processor,
        ingestion=ingestion,
        replace=True,
        sync_mode="full",
    )
    success(f"Ingested {manual_path.name} into collection '{COLLECTION_NAME}'")


async def _verify(vector_store: BaseVectorStore) -> None:
    """Verify the target collection contains document chunks."""
    collection_info = await vector_store.get_collection_info(COLLECTION_NAME)
    info(f"Collection '{COLLECTION_NAME}' vectors: {collection_info.total_vectors}")
    if collection_info.total_vectors <= 0:
        raise click.ClickException(f"Collection '{COLLECTION_NAME}' has no document chunks")


@command("seed-mobility-kb", help="Seed mobility operations knowledge base")
def seed_mobility_kb() -> None:
    """Create the KB record and ingest the mobility operations manual."""

    async def _seed() -> None:
        async with get_db_context() as db:
            kb = await _ensure_kb(db)
            info(f"Knowledge base: id={kb.id}, collection={kb.collection_name}")

        _, vector_store, processor, _, ingestion = get_rag_services()
        await _ingest_manual(vector_store, processor, ingestion)
        await _verify(vector_store)
        success("Mobility operations knowledge base seeded successfully.")

    asyncio.run(_seed())
