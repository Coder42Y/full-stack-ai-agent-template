{%- if cookiecutter.enable_rag %}
"""RAG Data Models.

Structures used to interface with the RAG feature."""

import uuid
from pydantic import BaseModel, Field, model_validator, computed_field
from typing import Optional, Any

from enum import StrEnum


{%- if cookiecutter.enable_rag_image_description %}
class DocumentImage(BaseModel):
    """An image extracted from a document page."""

    image_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    page_num: int = 0
    image_bytes: bytes = b""
    description: str = ""
    mime_type: str = "image/png"
{%- endif %}


class DocumentPage(BaseModel):
    """Content of document's page."""

    page_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    page_num: int
    content: str
    parent_doc_id: Optional[str] = None
{%- if cookiecutter.enable_rag_image_description %}
    images: list[DocumentImage] = Field(default_factory=list)
{%- endif %}
    
    
class DocumentPageChunk(DocumentPage):
    """Content of chunked document's page."""
    chunk_content: str
    chunk_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chunk_num: int = 0


class DocumentMetadata(BaseModel):
    """Metadata of a document."""

    filename: str
    filesize: int
    filetype: str
    source_path: str = ""  # original path: local path, s3://bucket/key, gdrive://file_id
    content_hash: str = ""  # SHA256 hash for deduplication
    additional_info: Optional[dict[str, Any]] = None


class Document(BaseModel):
    """A Document object that describes an ingested file."""
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pages: list[DocumentPage]
    chunked_pages: Optional[list[DocumentPageChunk]] = None
    metadata: DocumentMetadata
    
    @computed_field  # type: ignore[prop-decorator]
    @property
    def num_pages(self) -> int:
        return len(self.pages) 
    
    @model_validator(mode="after")
    def connect_pages(self) -> "Document":
        for page in self.pages:
            page.parent_doc_id = self.id
        return self     

    def to_markdown(self) -> str:
        """Return the full parsed document as stable Markdown-like text."""
        parts: list[str] = []
        for page in sorted(self.pages, key=lambda p: p.page_num):
            content = page.content.strip()
            if not content:
                continue
            if len(self.pages) > 1:
                parts.append(f"<!-- page: {page.page_num} -->\n\n{content}")
            else:
                parts.append(content)
        return "\n\n".join(parts).strip()
         
    
class SearchResult(BaseModel):
    """A schema of vector store query output."""
    
    content: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)
    parent_doc_id: Optional[str] = None


class IngestionStatus(StrEnum):
    """A collection of available ingestion statuses."""
    
    NEW = "new"
    PROCESSING = "processing"
    ADDING = "adding"
    DONE = "done"
    ERROR = "error"
    

class IngestionResult(BaseModel):
    """A schema to handle document ingestion results."""
    
    status: IngestionStatus = IngestionStatus.NEW
    message: Optional[str] = None
    error_message: Optional[str] = None
    document_id: Optional[str] = None
    markdown_content: Optional[str] = None
    chunk_count: int = 0
    
    
class CollectionInfo(BaseModel):
    """Collection of information about given collection."""
    
    name: str
    total_vectors: int
    dim: int
    indexing_status: str = "complete"


class DocumentInfo(BaseModel):
    """Information about a document stored in a collection."""
    
    document_id: str
    filename: Optional[str] = None
    filesize: Optional[int] = None
    filetype: Optional[str] = None
    chunk_count: int = 0
    additional_info: Optional[dict[str, Any]] = None
{%- endif %}
