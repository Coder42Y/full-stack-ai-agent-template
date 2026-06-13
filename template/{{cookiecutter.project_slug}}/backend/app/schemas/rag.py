{%- if cookiecutter.enable_rag %}
"""RAG API schemas."""

from typing import Any

from pydantic import BaseModel, Field


class RAGSearchRequest(BaseModel):
    """Parameters for a vector search query."""
    collection_name: str = Field("documents", description="Target collection for search")
    collection_names: list[str] | None = Field(None, description="Search across multiple collections (overrides collection_name)")
    query: str = Field(..., description="Natural language search query")
    limit: int = Field(default=4, ge=1, le=20)
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)
    filter: str | None = Field(None, description="Scalar filter expression (e.g. 'filetype == \"pdf\"')")


class RAGSearchResult(BaseModel):
    """A single retrieved chunk with its associated metadata."""
    content: str
    score: float
    metadata: dict[str, Any]
    parent_doc_id: str


class RAGSearchResponse(BaseModel):
    """List of results found in the vector store."""
    results: list[RAGSearchResult]


class RAGCollectionInfo(BaseModel):
    """Statistical information about a specific collection."""
    name: str
    total_vectors: int
    dim: int
    indexing_status: str = "complete"


class RAGCollectionList(BaseModel):
    """List of all available collection names."""
    items: list[str]


class RAGDocumentItem(BaseModel):
    """Information about a single document in a collection."""
    document_id: str = Field(..., description="Unique identifier of the document")
    filename: str | None = Field(None, description="Original filename of the document")
    filesize: int | None = Field(None, description="Size of the file in bytes")
    filetype: str | None = Field(None, description="MIME type of the file")
    chunk_count: int = Field(default=0, description="Number of chunks/vectors in the collection")
    additional_info: dict[str, Any] | None = Field(None, description="Additional metadata")


class RAGDocumentList(BaseModel):
    """List of all documents in a collection."""
    items: list[RAGDocumentItem]
    total: int = Field(..., description="Total number of unique documents")


class RAGMessageResponse(BaseModel):
    """Simple message response."""
    message: str

{%- if cookiecutter.use_postgresql or cookiecutter.use_sqlite %}


class RAGTrackedDocumentItem(BaseModel):
    """A document tracked in the SQL database."""
    id: str
    collection_name: str
    filename: str
    filesize: int
    filetype: str
    status: str
    error_message: str | None = None
    vector_document_id: str | None = None
    chunk_count: int = 0
    has_file: bool = False
    has_markdown_content: bool = False
    version: int = 1
    is_latest: bool = True
    previous_version_id: str | None = None
    modified_by: str | None = None
    created_at: str | None = None
    completed_at: str | None = None


class RAGTrackedDocumentList(BaseModel):
    """List of tracked RAG documents."""
    items: list[RAGTrackedDocumentItem]
    total: int


class RAGIngestResponse(BaseModel):
    """Response for document ingestion (async or sync)."""
    id: str
    status: str
    filename: str
    collection: str
    message: str
    document_id: str | None = None


class RequirementQueryRequest(BaseModel):
    """Grounded requirement query against one or more KB documents."""
    query: str = Field(..., min_length=1, description="Natural language requirement question")
    limit: int = Field(default=5, ge=1, le=10, description="Maximum source chunks to inspect")
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)
    role: str | None = Field(default=None, description="MVP selected role: product or developer")


class RequirementQuerySource(BaseModel):
    """A source section used for a grounded requirement answer."""
    document_id: str
    vector_document_id: str | None = None
    filename: str
    label: str
    score: float
    page_num: int | None = None
    chunk_num: int | None = None
    excerpt: str


class RequirementQueryResponse(BaseModel):
    """Requirement query response with explicit original-document sources."""
    answer: str
    sources: list[RequirementQuerySource] = Field(default_factory=list)
    is_grounded: bool = False
    message: str | None = None
    ai_used: bool = False
    ai_model: str | None = None
    ai_error: str | None = None


class RequirementNotificationEvent(BaseModel):
    """Lightweight requirement event payload for demo notifications."""
    event_type: str
    kb_id: str
    document_id: str
    filename: str
    message: str


class RequirementIntakeRequest(BaseModel):
    """Create a requirement document from a short natural-language description."""
    description: str = Field(..., min_length=1)
    title: str | None = Field(default=None, max_length=120)
    filename: str | None = Field(default=None, max_length=255)


class RequirementIntakeResponse(BaseModel):
    """Response for one-sentence requirement intake."""
    document_id: str
    filename: str
    markdown_content: str
    clarification_questions: list[str] = Field(default_factory=list)
    notification_event: RequirementNotificationEvent | None = None
    ai_used: bool = False
    ai_model: str | None = None
    ai_error: str | None = None


class RequirementBreakdownItem(BaseModel):
    """One requirement breakdown item with source citation."""
    title: str
    summary: str
    source_label: str
    excerpt: str
    test_focus: list[str] = Field(default_factory=list)


class RequirementBreakdownResponse(BaseModel):
    """Requirement breakdown grounded in a stored Markdown document."""
    document_id: str
    filename: str
    answer: str
    items: list[RequirementBreakdownItem] = Field(default_factory=list)
    ai_used: bool = False
    ai_model: str | None = None
    ai_error: str | None = None


class RequirementChangeRequest(BaseModel):
    """Request to suggest, draft, or apply a requirement document change."""
    instruction: str = Field(..., min_length=1)
    apply: bool = Field(default=False, description="Apply immediately instead of creating a draft")


class RequirementChangeResponse(BaseModel):
    """Response for requirement change workflow."""
    action: str
    message: str
    previous_document_id: str | None = None
    document_id: str | None = None
    filename: str | None = None
    diff_summary: str | None = None
    markdown_preview: str | None = None
    notification_event: RequirementNotificationEvent | None = None
    ai_used: bool = False
    ai_model: str | None = None
    ai_error: str | None = None


class RequirementDocumentVersionItem(BaseModel):
    """One version in a requirement document version chain."""
    document_id: str
    filename: str
    version: int
    status: str
    is_latest: bool
    previous_version_id: str | None = None
    modified_by: str | None = None
    has_markdown_content: bool = False
    created_at: str | None = None
    completed_at: str | None = None


class RequirementDocumentVersionList(BaseModel):
    """Version history for one requirement document chain."""
    items: list[RequirementDocumentVersionItem] = Field(default_factory=list)
    total: int = 0


class RequirementDocumentDiffResponse(BaseModel):
    """Markdown diff between two requirement document versions."""
    filename: str
    from_document_id: str
    to_document_id: str
    from_version: int
    to_version: int
    summary: str
    diff_lines: list[str] = Field(default_factory=list)


class RAGRetryResponse(BaseModel):
    """Response for document retry."""
    id: str
    status: str
    message: str


class RAGSyncRequest(BaseModel):
    """Request to trigger a sync operation."""
    collection_name: str = Field("documents", description="Target collection")
    mode: str = Field("full", description="Sync mode: full, new_only, update_only")
    path: str = Field("", description="Source path")


class RAGSyncLogItem(BaseModel):
    """A sync operation log entry."""
    id: str
    source: str
    collection_name: str
    status: str
    mode: str
    total_files: int = 0
    ingested: int = 0
    updated: int = 0
    skipped: int = 0
    failed: int = 0
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


class RAGSyncLogList(BaseModel):
    """List of sync log entries."""
    items: list[RAGSyncLogItem]
    total: int


class RAGSyncResponse(BaseModel):
    """Response for sync trigger."""
    id: str
    status: str
    message: str
{%- endif %}
{%- endif %}
