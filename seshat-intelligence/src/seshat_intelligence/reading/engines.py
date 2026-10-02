"""The conversion engines (Docling, Marker) the router can call, and the policy that orders them."""

from __future__ import annotations

import importlib.util
import logging
from typing import Protocol, Sequence

from seshat_intelligence.documents.conversion_pool import ConversionPool
from seshat_intelligence.providers.base import ConvertedDocument

logger = logging.getLogger(__name__)

# Import names used to tell whether an optional engine is installed.
_IMPORT_NAMES = {"docling": "docling", "marker": "marker"}


class Engines(Protocol):
    """What the reading router needs from the engines. Tests replace it with a fake."""

    def order_for(self, extension: str) -> list[str]: ...

    def available(self) -> list[str]: ...

    async def convert(self, engine: str, filename: str, data: bytes) -> ConvertedDocument: ...


class EnginePolicy:
    """Which engines to try, in order, for a file type.

    - Marker only handles PDFs, Docling handles every format, so anything else goes to Docling.
    - For PDFs, "docling" or "marker" uses that engine alone; "auto" tries Docling first and then
      Marker as a second opinion when the first result is empty or garbled. The order is a plain
      default: no per-document-type rule is built in until there is a measurement behind it.
    """

    def __init__(self, enabled: Sequence[str], pdf: str = "auto") -> None:
        self._enabled = list(dict.fromkeys(enabled))
        self._pdf = pdf

    def available(self) -> list[str]:
        return list(self._enabled)

    def order_for(self, extension: str) -> list[str]:
        if extension != ".pdf":
            return ["docling"] if "docling" in self._enabled else []
        if self._pdf == "auto":
            return [name for name in ("docling", "marker") if name in self._enabled]
        return [self._pdf] if self._pdf in self._enabled else []


def installed(engine: str) -> bool:
    name = _IMPORT_NAMES.get(engine)
    return bool(name) and importlib.util.find_spec(name) is not None


class PoolEngines:
    """Engines backed by one conversion process pool each, created on first use so an engine that is
    enabled but never needed costs no memory."""

    def __init__(self, enabled: Sequence[str], pdf_policy: str, max_workers: int) -> None:
        available = []
        for engine in dict.fromkeys(enabled):
            if installed(engine):
                available.append(engine)
            else:
                logger.warning("document engine %r is enabled but not installed; ignoring it", engine)
        self._policy = EnginePolicy(available, pdf_policy)
        self._max_workers = max_workers
        self._pools: dict[str, ConversionPool] = {}

    def order_for(self, extension: str) -> list[str]:
        return self._policy.order_for(extension)

    def available(self) -> list[str]:
        return self._policy.available()

    async def convert(self, engine: str, filename: str, data: bytes) -> ConvertedDocument:
        pool = self._pools.get(engine)
        if pool is None:
            pool = self._pools[engine] = ConversionPool(engine, self._max_workers)  # type: ignore[arg-type]
        return await pool.convert(filename, data)

    def shutdown(self) -> None:
        for pool in self._pools.values():
            pool.shutdown()
