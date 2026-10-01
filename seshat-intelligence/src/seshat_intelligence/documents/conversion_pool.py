from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
from typing import TYPE_CHECKING

from seshat_intelligence.providers.base import ConvertedDocument

if TYPE_CHECKING:
    from seshat_intelligence.config import DocumentProviderName

# Set once per worker process by _init_worker, not per request - each
# worker keeps its own provider (and the models it loaded) alive for as
# long as the worker lives.
_provider = None


def _init_worker(provider_name: "DocumentProviderName") -> None:
    global _provider
    if provider_name == "marker":
        from seshat_intelligence.providers.marker import MarkerProvider

        _provider = MarkerProvider()
    else:
        from seshat_intelligence.providers.docling import DoclingProvider

        _provider = DoclingProvider()


def _convert_in_worker(filename: str, data: bytes) -> ConvertedDocument:
    assert _provider is not None, "conversion worker was not initialized"
    return _provider.convert_bytes(filename, data)


class ConversionPool:
    """Runs document conversions on a fixed-size pool of separate worker
    processes instead of the request-handling process, for two reasons:

    - It keeps the asyncio event loop free. Docling/Marker conversion is a
      long, blocking, CPU-bound call - running it in-process (even in a
      thread) would still hold the GIL for its pure-Python portions and,
      worse, a crash inside the conversion library would take the whole
      API process down with it.
    - It bounds concurrency. Each in-flight conversion holds a full model's
      worth of memory; letting an unbounded number run at once risks an
      OOM under load. `max_workers` processes is the hard ceiling - once
      all are busy, further conversions queue (ProcessPoolExecutor's own
      call queue) instead of piling up unbounded.

    Each worker loads its provider once, in _init_worker, the first time
    that worker is used - not per conversion.
    """

    def __init__(self, provider_name: "DocumentProviderName", max_workers: int) -> None:
        self._executor = ProcessPoolExecutor(
            max_workers=max_workers,
            initializer=_init_worker,
            initargs=(provider_name,),
        )

    async def convert(self, filename: str, data: bytes) -> ConvertedDocument:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, _convert_in_worker, filename, data)

    def shutdown(self) -> None:
        self._executor.shutdown(cancel_futures=True)
