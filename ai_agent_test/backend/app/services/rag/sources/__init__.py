"""RAG document source connectors.

Provides integrations for fetching documents from external sources
(Google Drive, S3) for ingestion into the RAG pipeline.
"""

try:
    from app.services.rag.sources.google_drive import GoogleDriveSource
except ImportError:  # google-api-python-client is optional -- GDrive disabled without it
    GoogleDriveSource = None  # type: ignore[assignment,misc]
from app.services.rag.sources.s3 import S3Source

__all__ = [
    "GoogleDriveSource",
    "S3Source",
]
