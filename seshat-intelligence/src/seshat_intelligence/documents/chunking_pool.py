from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor

from seshat_intelligence.providers.chunker.base import ChunkResult

# Set once per worker process by _init_worker, not per request.
_chunker = None


def _init_worker() -> None:
    global _chunker
    from seshat_intelligence.providers.chunker.docling import DoclingHybridChunker

    _chunker = DoclingHybridChunker()


def _chunk_in_worker(filename: str, data: bytes) -> list[ChunkResult]:
    assert _chunker is not None, "chunking worker was not initialized"
    return _chunker.chunk_bytes(filename, data)


class ChunkingPool:
    """Same rationale as ConversionPool (see its own doc comment): a fixed
    pool of separate worker processes keeps the event loop free and bounds
    memory under load.

    A separate pool from ConversionPool on purpose - chunking always loads
    Docling's own models (see providers/chunker/docling.py), regardless of which
    provider `document_provider` configures for plain conversion. Sharing
    one pool between both jobs would mean every worker keeps both
    providers' models resident, for no reason when only one job type ever
    lands on it in practice.
    """

    def __init__(self, max_workers: int) -> None:
        self._executor = ProcessPoolExecutor(max_workers=max_workers, initializer=_init_worker)

    async def chunk(self, filename: str, data: bytes) -> list[ChunkResult]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, _chunk_in_worker, filename, data)

    def shutdown(self) -> None:
        self._executor.shutdown(cancel_futures=True)
