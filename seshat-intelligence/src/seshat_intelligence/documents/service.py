from __future__ import annotations

from seshat_intelligence.documents.chunking_pool import ChunkingPool
from seshat_intelligence.documents.conversion_pool import ConversionPool
from seshat_intelligence.documents.store import DocumentStore, StoredDocument
from seshat_intelligence.providers.chunker.base import ChunkResult


class ConvertDocument:
    """The one use case this slice supports: take bytes, run them through
    the configured provider (via the ConversionPool, off the event loop),
    keep the full result. Chunking/embeddings/indexing are deliberately not
    here yet - this is step 1 (a real, working conversion service) before
    step 2 (everything built on top of it)."""

    def __init__(self, pool: ConversionPool, store: DocumentStore) -> None:
        self._pool = pool
        self._store = store

    async def execute(self, filename: str, data: bytes) -> StoredDocument:
        converted = await self._pool.convert(filename, data)
        return self._store.save(
            filename=filename,
            original_bytes=data,
            status=converted.status,
            raw=converted.raw,
            markdown=converted.markdown,
            errors=converted.errors,
        )


class ChunkDocument:
    """The document-aware chunking use case: take bytes, get back Docling's
    hybrid chunks. Stateless on purpose, unlike ConvertDocument - nothing is
    persisted here. Chunk caching/storage is seshat's own Go RAG pipeline's
    job (internal/rag/chunk_cache.go), not this service's."""

    def __init__(self, pool: ChunkingPool) -> None:
        self._pool = pool

    async def execute(self, filename: str, data: bytes, max_tokens: int | None = None) -> list[ChunkResult]:
        return await self._pool.chunk(filename, data, max_tokens)
